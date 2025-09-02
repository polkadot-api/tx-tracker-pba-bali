import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

export default function marsian83(api: API, outputApi: OutputAPI) {
  const chain = new Chain()

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    chain.addBlock(blockHash, parent)
    const txns = api.getBody(blockHash)
    txns.sort((a, b) => chain.transactionIds[b] - chain.transactionIds[a])

    for (const txn of txns) {
      chain.registerTxn(blockHash, txn)

      const valid = api.isTxValid(blockHash, txn)
      const type = valid ? "valid" : "invalid"
      const successful = valid ? api.isTxSuccessful(blockHash, txn) : false

      outputApi.onTxSettled(txn, {
        blockHash,
        type,
        successful,
      })
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    chain.addTxn(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const siblings = chain.siblings(blockHash)

    for (const sibling of siblings) {
      const pruned = chain.pruneBranch(sibling.hash) || []
      api.unpin(pruned)
    }
  }

  return (event: IncomingEvent) => {
    switch (event.type) {
      case "newBlock": {
        onNewBlock(event)
        break
      }
      case "newTransaction": {
        onNewTx(event)
        break
      }
      case "finalized":
        onFinalized(event)
    }
  }
}

interface Block {
  hash: string
  parent: { hash: string }
  children: { hash: string }[]
  txns: string[]
}

class Chain {
  blocks: Block[]
  transactionIds: Record<string, number>
  private currentTxnId: number = 0

  constructor() {
    this.blocks = []
    this.transactionIds = {}
  }

  addBlock(hash: string, parent: string) {
    this.blocks.push({ hash, parent: { hash: parent }, children: [], txns: [] })
  }

  addTxn(txn: string) {
    if (this.transactionIds[txn]) return
    this.transactionIds[txn] = ++this.currentTxnId
  }

  siblings(blockHash: string) {
    const block = this.getBlock(blockHash)
    if (!block) return []

    const parent = this.getBlock(block.parent.hash)
    if (!parent) return []

    const sibs = parent.children.filter(
      (sibling) => sibling.hash !== block.hash,
    )

    return sibs
  }

  registerTxn(blockHash: string, txn: string) {
    const block = this.getBlock(blockHash)
    if (!block) return

    block.txns.push(txn)
  }

  getBlock(hash: string): Block | undefined {
    return this.blocks.find((block) => block.hash === hash)
  }

  pruneBranch(hash: string) {
    const block = this.getBlock(hash)
    if (!block) return

    let pruned = []

    const children = block.children
    for (const child of children) {
      pruned.push(child.hash)
      this.pruneBranch(child.hash)
    }

    this.removeBlock(hash)
    return pruned
  }

  private removeBlock(hash: string) {
    const block = this.getBlock(hash)
    if (!block) return

    this.blocks = this.blocks.filter((b) => b !== block)
  }
}
