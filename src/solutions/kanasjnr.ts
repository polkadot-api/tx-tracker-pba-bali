import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function Kanasjnr(api: API, outputApi: OutputAPI) {
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

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const body = api.getBody(blockHash)

    const state =
      (api as any).__trackerState ??
      ((api as any).__trackerState = {
        arrived: [] as string[],
        settledByBlock: new Map<string, Map<string, Settled>>(),
        done: new Set<string>(),
      })

    let perBlock: Map<string, Settled> = state.settledByBlock.get(blockHash)
    if (!perBlock) {
      perBlock = new Map<string, Settled>()
      state.settledByBlock.set(blockHash, perBlock)
    }

    const candidates = state.arrived.filter(
      (tx: string) =>
        !perBlock.has(tx) &&
        (body.includes(tx) || !api.isTxValid(blockHash, tx)),
    )

    for (let i = 0; i < candidates.length; i++) {
      const tx = candidates[i]
      let settled: Settled
      if (body.includes(tx)) {
        const valid = api.isTxValid(blockHash, tx)
        if (!valid) {
          settled = { type: "invalid", blockHash }
        } else {
          const successful = api.isTxSuccessful(blockHash, tx)
          settled = { type: "valid", successful, blockHash }
        }
      } else {
        settled = { type: "invalid", blockHash }
      }
      perBlock.set(tx, settled)
      outputApi.onTxSettled(tx, settled)
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    const state =
      (api as any).__trackerState ??
      ((api as any).__trackerState = {
        arrived: [] as string[],
        settledByBlock: new Map<string, Map<string, Settled>>(),
        done: new Set<string>(),
      })
    if (!state.arrived.includes(transaction)) state.arrived.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const state = (api as any).__trackerState
    if (!state) return
    const perBlock: Map<string, Settled> | undefined =
      state.settledByBlock.get(blockHash)
    if (!perBlock) return
    for (let i = 0; i < state.arrived.length; i++) {
      const tx = state.arrived[i]
      if (!perBlock.has(tx)) continue
      if (state.done.has(tx)) continue
      const settled = perBlock.get(tx)!
      state.done.add(tx)
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
