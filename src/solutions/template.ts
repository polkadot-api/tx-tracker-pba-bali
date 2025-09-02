import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function aryaramadika(api: API, outputApi: OutputAPI) {
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

  const txQueue: string[] = []
  const settledByBlock = new Map<string, Map<string, Settled>>()
  const doneTx = new Set<string>()

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const body = api.getBody(blockHash)

    let byBlock = settledByBlock.get(blockHash)
    if (!byBlock) {
      byBlock = new Map<string, Settled>()
      settledByBlock.set(blockHash, byBlock)
    }
    for (const tx of txQueue) {
      if (byBlock.has(tx)) continue

      let state: Settled | null = null

      if (body.includes(tx)) {
        const valid = api.isTxValid(blockHash, tx)
        if (valid) {
          const successful = api.isTxSuccessful(blockHash, tx)
          state = { type: "valid", successful, blockHash }
        } else {
          state = { type: "invalid", blockHash }
        }
      } else {
        const valid = api.isTxValid(blockHash, tx)
        if (!valid) state = { type: "invalid", blockHash }
      }

      if (state) {
        byBlock.set(tx, state)
        outputApi.onTxSettled(tx, state)
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    if (!txQueue.includes(transaction)) txQueue.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const byBlock = settledByBlock.get(blockHash)
    if (!byBlock) return

    for (const tx of txQueue) {
      const state = byBlock.get(tx)
      if (!state) continue

      if (doneTx.has(tx)) continue
      doneTx.add(tx)

      outputApi.onTxDone(tx, state)
    }
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
