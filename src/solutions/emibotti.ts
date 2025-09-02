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

  const transactions: string[] = []

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const blockBody = api.getBody(blockHash)
    for (const tx of transactions) {
      // INFO: Valid: the transaction can be included into the next block.
      // INFO: A transaction could be valid against one block, but invalid against a "sibling fork" of the same height
      if (api.isTxValid(blockHash, tx)) {
        const successful = api.isTxSuccessful(blockHash, tx)

        outputApi.onTxSettled(tx, {
          type: "valid",
          // INFO: If `successful` is `false` it is a Failed transaction
          successful,
          blockHash,
        })

        // "Future" Valid: the transaction can not yet be included into a block, but it may be included in the future. I.e. nonce too high.
        // TODO: How to check nonce?
      } else {
        // INFO: Invalid: the transaction will "never" be able to be included into a block (and thus, not be broadcasted).
        // TODO: remove transaction from list so it cannot be broadcasted
        transactions.splice(transactions.indexOf(tx), 1)
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    transactions.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    for (const tx of transactions) {
      if (api.isTxSuccessful(blockHash, tx)) {
        outputApi.onTxDone(tx, {
          type: "valid",
          blockHash,
          successful: true,
        })

        // TODO: Remove transaction from list
        transactions.splice(transactions.indexOf(tx), 1)
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
