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

    const trackedTxn: any[] = [];
    let counter = 0;

    const parentOf = new Map<string, string>()

    const isDes = (hash: string, ancestor: string) => {
      let current: string | undefined = hash
      while (current) {
        if (current === ancestor) return true
        current = parentOf.get(current)
      }
      return false
    }

    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
      parentOf.set(blockHash, parent)

      const candidates = trackedTxn
        .filter(tx => !tx.done && !tx.settledInBlocks.has(blockHash) &&
          !(tx.firstSettledBlock && isDes(blockHash, tx.firstSettledBlock)))
        .sort((a, b) => a.arrivalOrder - b.arrivalOrder)

      if (candidates.length === 0) return

      let body: string[] | null = null
      const getBodyOnce = () => {
        if (body === null) body = api.getBody(blockHash)
        return body
      }

      candidates.forEach(tx => {
       
        if (!tx.firstSettledBlock) {
          tx.firstSettledBlock = blockHash
        } else {
          const fs = tx.firstSettledBlock
          if (!isDes(blockHash, fs) && !isDes(fs, blockHash)) {
            tx.firstSettledBlock = blockHash
          }
        }


        const inBody = getBodyOnce().includes(tx.transaction)
        if (inBody) {
          const successful = api.isTxSuccessful(blockHash, tx.transaction)
          const state = { type: "valid" as const, successful }
          tx.firstSettledState = state
          tx.settledInBlocks.add(blockHash)
          outputApi.onTxSettled(tx.transaction, { blockHash, ...state })
          return
        }


        const valid = api.isTxValid(blockHash, tx.transaction)
        if (!valid) {
          const state = { type: "invalid" as const }
          tx.firstSettledState = state
          tx.settledInBlocks.add(blockHash)
          outputApi.onTxSettled(tx.transaction, { blockHash, ...state })
        }
      })
    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      // TODO:: implement it
      trackedTxn.push({
        transaction,
        arrivalOrder: counter,
        done: false,
        settledInBlocks: new Set<string>(),
      })
      counter++;
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      
      trackedTxn
        .filter(tx => !tx.done && tx.firstSettledBlock)
        .sort((a, b) => a.arrivalOrder - b.arrivalOrder)
        .forEach(tx => {
          const settled = tx.firstSettledBlock
          if (isDes(blockHash, settled)) {
       
            outputApi.onTxDone(tx.transaction, { blockHash: settled, ...tx.firstSettledState })
            tx.done = true
          }
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
