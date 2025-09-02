import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

export default function daficreatella25(api: API, outputApi: OutputAPI) {
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

  const transactionRecord: Record<string, {settlement?: Settled, blockhash: string}> = {}
  const transactionOrder: string[] = []
  const settledByBlock: Record<string, Record<string, Settled>> = {}
  const doneTransactions: Record<string, boolean> = {}

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const blockBodies = api.getBody(blockHash)


    if (!settledByBlock[blockHash]) {
      settledByBlock[blockHash] = {}
    }

    for (const transaction of transactionOrder) {
      if (settledByBlock[blockHash][transaction]) continue

      // IN HERE I FOUND THAT IF BLOCK HASH DOESNT HAVE BODY IT MEAN INVALID
      const shouldSettle = blockBodies.includes(transaction) || !api.isTxValid(blockHash, transaction)
      
      if (shouldSettle) {
        let settled: Settled

        if (blockBodies.includes(transaction)) {
          // Transaction is in block body
          const isValid = api.isTxValid(blockHash, transaction)
          if (isValid) {
            const isSuccessful = api.isTxSuccessful(blockHash, transaction)
            settled = {
              blockHash,
              type: "valid",
              successful: isSuccessful
            }
          } else {
            settled = {
              blockHash,
              type: "invalid"
            }
          }
        } else {
          // Transaction not in body but invalid in this block
          settled = {
            blockHash,
            type: "invalid"
          }
        }

        settledByBlock[blockHash][transaction] = settled
        transactionRecord[transaction].settlement = settled
        transactionRecord[transaction].blockhash = blockHash
        outputApi.onTxSettled(transaction, settled)
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    // TODO:: implement it
    transactionRecord[transaction] = {
      blockhash: ''
    }
    transactionOrder.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // TODO:: implement it
    if (!settledByBlock[blockHash]) return

    for (const transaction of transactionOrder) {
      if (!settledByBlock[blockHash][transaction] || doneTransactions[transaction]) continue

      const settled = settledByBlock[blockHash][transaction]
      doneTransactions[transaction] = true
      outputApi.onTxDone(transaction, settled)
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