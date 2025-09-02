import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

export default function emibotti(api: API, outputApi: OutputAPI) {
  // Requirements:
  //
  // 1) When a transaction becomes "settled"-which always occurs upon receiving a "newBlock" event-
  //    you must call `outputApi.onTxSettled`.
  //
  //    - Multiple transactions may settle in the same block, so `onTxSettled` could be called
  //      multiple times per "newBlock" event.
  //    - Ensure callbacks are invoked in the same order as the transactions originally arrived.
  //
  // 2) When a transaction becomes "done"-meaning the block it was settled in gets finalized-
  //    you must call `outputApi.onTxDone`.
  //
  //    - Multiple transactions may complete upon a single "finalized" event.
  //    - As above, maintain the original arrival order when invoking `onTxDone`.
  //    - Keep in mind that the "finalized" event is not emitted for all finalized blocks.
  //
  // Notes:
  // - It is **not** ok to make redundant calls to either `onTxSettled` or `onTxDone`.
  // - It is ok to make redundant calls to `getBody`, `isTxValid` and `isTxSuccessful`
  //
  // Bonus 1:
  // - Avoid making redundant calls to `getBody`, `isTxValid` and `isTxSuccessful`.
  //
  // Bonus 2:
  // - Upon receiving a "finalized" event, call `api.unpin` to unpin blocks that are either:
  //     a) pruned, or
  //     b) older than the currently finalized block.

  type BlockHash = string

  interface Block {
    hash: BlockHash
    body: any
    parent: BlockHash | null
    children: BlockHash[]
    settled: boolean
  }

  const blocks: Map<BlockHash, Block> = new Map()

  interface TxInfo {
    id: string
    settled: boolean
    settledBlock: BlockHash | null
    valid: boolean | null
    successful?: boolean
  }

  const transactions: TxInfo[] = []

  const isSettledOrDescendantOfSettled = (blockHash: BlockHash): boolean => {
    let currentBlock = blocks.get(blockHash)
    while (currentBlock) {
      if (currentBlock.settled) return true
      if (currentBlock.parent === null) return false
      currentBlock = blocks.get(currentBlock.parent)
    }
    return false
  }

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const blockBody = api.getBody(blockHash)
    blocks.set(blockHash, {
      hash: blockHash,
      parent,
      body: blockBody,
      children: [],
      settled: false,
    })
    if (parent) {
      const parentBlock = blocks.get(parent)
      if (parentBlock) {
        parentBlock.children.push(blockHash)
      }
    }

    // TODO: Remember to mark block as settled
    if (isSettledOrDescendantOfSettled(blockHash)) {
      return
    }

    const currentBlock = blocks.get(blockHash)!

    for (const transaction of transactions) {
      if (transaction.settled) continue

      const isTransactionPresentInTheBody = blockBody.find(
        (tx) => tx === transaction.id,
      )
      const isItValidInThisBlock = api.isTxValid(blockHash, transaction.id)

      if (!isTransactionPresentInTheBody) {
        if (isItValidInThisBlock) return

        transaction.valid = false
        transaction.settledBlock = blockHash
        transaction.successful = false
        transaction.settled = true
        currentBlock.settled = true

        outputApi.onTxSettled(transaction.id, {
          type: "invalid",
          blockHash,
        })
      } else {
        const transactionWasSuccessful = api.isTxSuccessful(
          blockHash,
          transaction.id,
        )
        transaction.successful = transactionWasSuccessful
        transaction.valid = true
        transaction.settledBlock = blockHash
        transaction.settled = true

        outputApi.onTxSettled(transaction.id, {
          type: "valid",
          blockHash,
          successful: transactionWasSuccessful,
        })

        // "Future" Valid: the transaction can not yet be included into a block, but it may be included in the future. I.e. nonce too high.
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    // console.log("new transaction", transaction)
    transactions.push({
      id: transaction,
      settled: false,
      settledBlock: null,
      valid: null,
    })
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // console.log("finalized", blockHash)

    for (const transaction of transactions) {
      if (
        transaction.settledBlock === blockHash &&
        isSettledOrDescendantOfSettled(blockHash)
      ) {
        outputApi.onTxDone(transaction.id, {
          type: transaction.valid ? "valid" : "invalid",
          blockHash,
          successful: !!transaction.successful,
        })
      }
    }

    // Remove blocks finalized iterating until the parent
    let currentBlock = blocks.get(blockHash)
    while (!!currentBlock) {
      // Remove the block from the map
      blocks.delete(currentBlock.hash)

      // Move to the parent block
      if (currentBlock.parent) {
        currentBlock = blocks.get(currentBlock.parent)
      } else {
        currentBlock = undefined
      }
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
