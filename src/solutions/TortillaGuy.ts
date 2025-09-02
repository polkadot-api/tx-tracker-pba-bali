import type { Statement } from "typescript"
import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function yourGhHandle(api: API, outputApi: OutputAPI) {
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

  type TxState = Settled & { tx: string }
  type BlockState = Record<
    string,
    {
      parent: string
      children: string[]
      body: string[]
      status: "pending" | "finalized"
    }
  >
  const chain = {} as BlockState
  let pendingTxs: string[] = []

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    console.log("new block ", blockHash)
    // console.log({ pendingTxs })
    const body = api.getBody(blockHash)
    chain[blockHash] = { parent, children: [], body, status: "pending" }
    if (parent) {
      chain[parent].children.push(blockHash)
    }
    pendingTxs.forEach((tx) => {
      if (body.includes(tx)) {
        outputApi.onTxSettled(tx, {
          blockHash,
          type: "valid",
          successful: api.isTxSuccessful(blockHash, tx),
        })
      } else {
        outputApi.onTxSettled(tx, {
          blockHash,
          type: "invalid",
        })
      }
    })
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    // console.log(`Tx: ` + transaction)
    pendingTxs.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {}

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
