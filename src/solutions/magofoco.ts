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

    // Sort by arrival order, since many transactions may be settled in the same block
    // We need to keep the order in which they arrived, in order to settle them
    transactionsToSettleInBlock.sort((a, b) => a.arrivalIndex - b.arrivalIndex)

    for (const { transaction } of transactionsToSettleInBlock) {
      const isTransactionValid = api.isTxValid(blockHash, transaction)
      let settledState: Settled

      if (isTransactionValid) {
        settledState = {
          blockHash,
          type: "valid",
          successful: api.isTxSuccessful(blockHash, transaction),
        }
      } else {
        settledState = {
          blockHash,
          type: "invalid",
        }
      }

      outputApi.onTxSettled(transaction, settledState)
      settledTransactions.push({
        transaction,
        settled: settledState,
        arrivalIndex: transactions.indexOf(transaction),
      })
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    transactions.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const finalizedTransactions: SettledTransaction[] = []

    const finalizedBlocks: string[] = []
    let currentBlock = blocks.find((block) => block.blockHash === blockHash)

    // This is to get the list of blocks that are finalized (cannot change)
    while (currentBlock) {
      finalizedBlocks.push(currentBlock.blockHash)
      currentBlock = blocks.find(
        (block) => block.blockHash === currentBlock?.parent,
      )
    }

    // Now, we can check the finalized transactions of those blocks finzalied
    for (const settledTransaction of settledTransactions) {
      if (finalizedBlocks.includes(settledTransaction.settled.blockHash)) {
        finalizedTransactions.push({
          transaction: settledTransaction.transaction,
          arrivalIndex: settledTransaction.arrivalIndex,
          settled: settledTransaction.settled,
        })
      }
    }

    finalizedTransactions.sort((a, b) => a.arrivalIndex - b.arrivalIndex)

    // Once finalized, the transaction is done (permanant into the block)
    for (const { transaction, settled } of finalizedTransactions) {
      outputApi.onTxDone(transaction, settled)

      const index = settledTransactions.findIndex(
        (s) =>
          s.transaction === transaction &&
          s.settled.blockHash === settled.blockHash,
      )
      if (index !== -1) {
        settledTransactions.splice(index, 1)
      }
    }

    for (const hash of finalizedBlocks) {
      const blockIndex = blocks.findIndex((block) => block.blockHash === hash)
      if (blockIndex !== -1) {
        blocks.splice(blockIndex, 1)
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
