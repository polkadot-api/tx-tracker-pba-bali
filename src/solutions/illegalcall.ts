import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
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


  const txnQueue: string[] = []
  const blockToParentMapping = new Map<string, string>()
  const txnToBlockMapping = new Map<string, string>()
  const blockHashToBody = new Map<string, string[]>()
  const txnValidityCache = new Map<string, boolean>()
  const txnSuccessCache = new Map<string, boolean>()

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {

    blockToParentMapping.set(blockHash, parent)

    for (const txn of txnQueue) {
      const validityKey = `${blockHash}-${txn}`
      let valid = txnValidityCache.get(validityKey)
      if (valid === undefined) {
        valid = api.isTxValid(blockHash, txn)
        txnValidityCache.set(validityKey, valid)
      }
      let blockBodyTxns = blockHashToBody.get(blockHash)
      if (blockBodyTxns === undefined) {
        blockBodyTxns = api.getBody(blockHash)
        blockHashToBody.set(blockHash, blockBodyTxns)
      }
      if (!valid) {
        outputApi.onTxSettled(txn, {
          blockHash,
          type: "invalid",
        })
        txnToBlockMapping.set(txn, blockHash)
      } else {
        if (blockBodyTxns.includes(txn)) {

          const successKey = `${blockHash}-${txn}`
          let successful = txnSuccessCache.get(successKey)
          if (successful === undefined) {
            successful = api.isTxSuccessful(blockHash, txn)
            txnSuccessCache.set(successKey, successful)
          }

          outputApi.onTxSettled(txn, {
            blockHash,
            type: "valid",
            successful,
          })
          txnToBlockMapping.set(txn, blockHash)
        }
      }
    }
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    if (txnQueue.includes(transaction)) return;
    txnQueue.push(transaction)
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    const blocksToFinalize = []
    let currentBlockHash = blockHash
    let parentBlockHash = blockToParentMapping.get(blockHash)

    while (parentBlockHash) {
      blocksToFinalize.push(currentBlockHash)
      currentBlockHash = parentBlockHash
      parentBlockHash = blockToParentMapping.get(currentBlockHash)
    }

    const txnToProcess = [...txnQueue]
    for (const txn of txnToProcess) {

      const shouldFinalize = blocksToFinalize.some(blockHash => {
        const blockBody = blockHashToBody.get(blockHash)
        if (!blockBody) return false

        const validityKey = `${blockHash}-${txn}`
        let valid = txnValidityCache.get(validityKey)
        if (valid === undefined) {
          valid = api.isTxValid(blockHash, txn)
          txnValidityCache.set(validityKey, valid)
        }

        if (blockBody.includes(txn)) {
          return true
        }
        if (!valid) {
          return true
        }
        return false
      })

      if (shouldFinalize) {
        const settledBlockHash = txnToBlockMapping.get(txn)!
        const validityKey = `${settledBlockHash}-${txn}`
        let valid = txnValidityCache.get(validityKey)
        if (valid === undefined) {
          valid = api.isTxValid(settledBlockHash, txn)
          txnValidityCache.set(validityKey, valid)
        }

        if (!valid) {
          outputApi.onTxDone(txn, {
            blockHash: settledBlockHash,
            type: "invalid",
          })
        } else {
          const successKey = `${settledBlockHash}-${txn}`
          let successful = txnSuccessCache.get(successKey)
          if (successful === undefined) {
            successful = api.isTxSuccessful(settledBlockHash, txn)
            txnSuccessCache.set(successKey, successful)
          }

          outputApi.onTxDone(txn, {
            blockHash: settledBlockHash,
            type: "valid",
            successful,
          })
        }

        const index = txnQueue.indexOf(txn)
        if (index > -1) {
          txnQueue.splice(index, 1)
        }
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
