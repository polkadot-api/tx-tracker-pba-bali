import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function yoghantara08(api: API, outputApi: OutputAPI) {
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

  const state = {
    new: new Set<string>(),
    settled: new Map<string, Map<string, Settled>>(),
    finalized: new Set<string>(),
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    state.new.add(transaction)
  }

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const body = api.getBody(blockHash)
    const blockSettled = state.settled.get(blockHash) ?? new Map()

    state.settled.set(blockHash, blockSettled)

    for (const tx of state.new) {
      if (blockSettled.has(tx)) continue
      if (!body.includes(tx) && api.isTxValid(blockHash, tx)) continue

      const settled: Settled =
        body.includes(tx) && api.isTxValid(blockHash, tx)
          ? {
              type: "valid",
              successful: api.isTxSuccessful(blockHash, tx),
              blockHash,
            }
          : { type: "invalid", blockHash }

      blockSettled.set(tx, settled)
      outputApi.onTxSettled(tx, settled)
    }
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const blockSettled = state.settled.get(blockHash)
    if (!blockSettled) return

    for (const [tx, settled] of blockSettled) {
      if (state.finalized.has(tx)) continue
      state.finalized.add(tx)
      outputApi.onTxDone(tx, settled)
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
