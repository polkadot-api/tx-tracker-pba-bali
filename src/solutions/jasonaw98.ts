import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function jasonaw98(api: API, outputApi: OutputAPI) {

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

  const pendingQueue: string[] = []
  const settledTransactions: Map<string, Map<string, Settled>> = new Map()
  const completedTransactions: Set<string> = new Set()

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const blockTransactions = api.getBody(blockHash)

    let settledBlock = settledTransactions.get(blockHash)
    if (!settledBlock) {
      settledBlock = new Map<string, Settled>()
      settledTransactions.set(blockHash, settledBlock)
    }

    const readyToSettle = pendingQueue.filter((tx) => {
      if (settledBlock.has(tx)) return false

      return blockTransactions.includes(tx) || !api.isTxValid(blockHash, tx)
    })

    readyToSettle.forEach((tx) => {
      let settlementState: Settled

      if (blockTransactions.includes(tx)) {
        const isValid = api.isTxValid(blockHash, tx)
        if (isValid) {
          const isSuccessful = api.isTxSuccessful(blockHash, tx)
          settlementState = {
            type: "valid",
            successful: isSuccessful,
            blockHash,
          }
        } else {
          settlementState = { type: "invalid", blockHash }
        }
      } else {
        settlementState = { type: "invalid", blockHash }
      }

      settledBlock.set(tx, settlementState)
      outputApi.onTxSettled(tx, settlementState)
    })
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    if (!pendingQueue.includes(transaction)) {
      pendingQueue.push(transaction)
    }
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const settledBlock = settledTransactions.get(blockHash)
    if (!settledBlock) return

    pendingQueue.forEach((tx) => {
      if (!settledBlock.has(tx) || completedTransactions.has(tx)) return

      const settlementState = settledBlock.get(tx)!
      completedTransactions.add(tx)
      outputApi.onTxDone(tx, settlementState)
    })
  }

  return (event: IncomingEvent) => {
    switch (event.type) {
      case "newBlock":
        onNewBlock(event)
        break
      case "newTransaction":
        onNewTx(event)
        break
      case "finalized":
        onFinalized(event)
        break
    }
  }
}
