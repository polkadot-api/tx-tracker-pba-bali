import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

type TxnState = "introduced" | "settled" | "finalized"

export default function marsian83(api: API, outputApi: OutputAPI) {
  const chain = new Chain()

  const txnStates: Record<string, TxnState> = {}

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    chain.addBlock(blockHash, parent)
    const txnsRaw = api.getBody(blockHash)
    const txns = txnsRaw
      .filter((t) => !!chain.transactionIds[t])
      .toSorted((a, b) => chain.transactionIds[b] - chain.transactionIds[a])

    if (
      blockHash ===
      "0xab1a39cff8e766a03c03883c5420471dd05266af0cda0161e7dc164ec2506867"
    ) {
      console.log(txnsRaw)
    }

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
    toBeSettled.add(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const pruningResults = chain.preserveOnlyChain(blockHash)
    if (!pruningResults) return
    const { killed, finalized } = pruningResults
    killed && api.unpin(killed)

    // for (const f of finalized) {
    //   const valid = api.isTxValid(blockHash, f)
    //   const successful = valid ? api.isTxSuccessful(blockHash, f) : false
    //   outputApi.onTxDone(f, {
    //     blockHash: f,
    //     successful,
    //     type: valid ? "valid" : "invalid",
    //   })
    // }
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
  lastFinalized: string = ""
  blocks: Block[]
  transactionIds: Record<string, number>
  private currentTxnId: number = 1

  constructor() {
    this.blocks = []
    this.transactionIds = {}
  }

  addBlock(hash: string, parent: string) {
    if (!this.lastFinalized) this.lastFinalized = hash
    const parentBlock = this.getBlock(parent)
    if (parentBlock) {
      parentBlock.children.push({ hash: hash })
    }
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

    let pruned: string[] = []

    for (const child of block.children) {
      const childPruned = this.pruneBranch(child.hash)
      if (childPruned) pruned = pruned.concat(childPruned)
    }

    this.removeBlock(hash)
    pruned.push(hash)
    return pruned
  }

  private removeBlock(hash: string) {
    const block = this.getBlock(hash)
    if (!block) return

    const parent = this.getBlock(block.parent.hash)
    if (parent) parent.children = parent.children.filter((c) => c.hash !== hash)

    this.blocks = this.blocks.filter((b) => b !== block)
  }

  preserveOnlyChain(blockHash: string) {
    const block = this.getBlock(blockHash)
    if (!block) return

    let killed: string[] = []
    let finalized: string[] = []

    let current = block.parent
    finalized.push(current.hash)
    while (current.hash != this.lastFinalized) {
      finalized.push(current.hash)

      const toKill = this.siblings(current.hash)

      for (const sib of toKill) {
        const pruned = this.pruneBranch(sib.hash)
        if (!pruned) continue
        killed = killed.concat(pruned)
      }

      const next = this.getBlock(current.hash)?.parent
      if (!next) break
      current = next
    }

    this.lastFinalized = blockHash

    return { killed, finalized }
  }
}
