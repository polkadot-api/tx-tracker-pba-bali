import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function prananda21(api: API, outputApi: OutputAPI) {
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

  const pendingTx: string[] = []
  const settledTx: Map<string, Map<string, Settled>> = new Map()
  const completedTx: Set<string> = new Set()

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    // TODO:: implement it
    const block = api.getBody(blockHash)

    let blockSettlement = settledTx.get(blockHash)
    if (!blockSettlement) {
      blockSettlement = new Map<string, Settled>()
      settledTx.set(blockHash, blockSettlement)
    }

    const readySettlement = pendingTx.filter((tx) => {
      if (blockSettlement.has(tx)) return false

      return block.includes(tx) || !api.isTxValid(blockHash, tx)
    })

    readySettlement.forEach((tx) => {
      let settlement: Settled

      if (block.includes(tx)) {
        const isValid = api.isTxValid(blockHash, tx)
        if (isValid) {
          const isSuccess = api.isTxSuccessful(blockHash, tx)
          settlement = { blockHash, type: "valid", successful: isSuccess }
        } else {
          settlement = { blockHash, type: "invalid" }
        }
      } else {
        settlement = { blockHash, type: "invalid" }
      }

      blockSettlement.set(tx, settlement)
      outputApi.onTxSettled(tx, settlement)
    })
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    // TODO:: implement it
    if (pendingTx.includes(transaction)) pendingTx.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // TODO:: implement it
    const blockSettlement = settledTx.get(blockHash)
    if (!blockSettlement) return
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
