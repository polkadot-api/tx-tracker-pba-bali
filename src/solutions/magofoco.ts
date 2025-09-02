import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function magofoco(api: API, outputApi: OutputAPI) {
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

  interface Block {
    blockHash: string
    parent: string
    children: string | undefined
  }

  interface TransactionToSettleInBlock {
    transaction: string
    arrivalIndex: number
  }

  interface SettledTransaction {
    transaction: string
    settled: Settled
    arrivalIndex: number
  }

  const transactions: string[] = []
  const blocks: Block[] = []
  const settledTransactions: SettledTransaction[] = []

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const transactionsToSettleInBlock: TransactionToSettleInBlock[] = []

    if (!blocks.some((block) => block.blockHash === blockHash)) {
      blocks.push({ parent: parent, children: undefined, blockHash })
    }

    const doesParentExist = blocks.some((block) => block.blockHash === parent)

    if (parent && doesParentExist) {
      const parentBlock = blocks.find((block) => block.blockHash === parent)
      if (parentBlock) {
        parentBlock.children = blockHash
      }
    }

    const blockBody = api.getBody(blockHash)

    // This is for when the transaction is included in the block body
    for (const transaction of blockBody) {
      if (transactions.includes(transaction)) {
        const alreadySettled = settledTransactions.some(
          (s) =>
            s.transaction === transaction && s.settled.blockHash === blockHash,
        )
        if (!alreadySettled) {
          const arrivalIndex = transactions.indexOf(transaction)
          transactionsToSettleInBlock.push({ transaction, arrivalIndex })
        }
      }
    }

    // This is for when the transaction is invalidated, like a user makes a transaction
    // but the immediate block does not include it, but it includes another transaction
    // of the same user that makes the first transaction invalid (ex. balance insufficient)
    for (const transaction of transactions) {
      if (blockBody.includes(transaction)) {
        continue // It is the included in the previous loop
      }
      const alreadySettled = settledTransactions.some(
        (s) =>
          s.transaction === transaction && s.settled.blockHash === blockHash,
      )
      if (!alreadySettled && !api.isTxValid(blockHash, transaction)) {
        const arrivalIndex = transactions.indexOf(transaction)
        transactionsToSettleInBlock.push({ transaction, arrivalIndex })
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    transactions.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // TODO:: implement it
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
