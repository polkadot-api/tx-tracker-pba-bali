import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

type Block = {
  hash: string
  parent: string | null
  children: string[]
}

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
  const blockArray = new Map<string, Block>() // hash → Block

  const txQueue: string[] = []
  const settledByBlock = new Map<string, Map<string, Settled>>()
  const doneTx = new Set<string>()

  // TODO: WILL ADDED AFTER CLASS
  const getDescendantBlocks = (
    block: Block,
    excludeBlock?: string,
  ): string[] => {
    const result: string[] = []

    for (const childHash of block.children ?? []) {
      if (childHash === excludeBlock) continue

      result.push(childHash)

      const childBlock = blockArray.get(childHash)
      if (childBlock) {
        result.push(...getDescendantBlocks(childBlock, excludeBlock))
      }
    }
    // return result
    return result
  }
  // TODO: WILL ADDED AFTER CLASS
  const getPrunedBlocks = (
    parentBlock: Block | undefined,
    finalizedChild: string,
  ): string[] => {
    if (!parentBlock) return []
    const toPrune: string[] = []

    for (const childHash of parentBlock.children ?? []) {
      if (childHash === finalizedChild) continue
      toPrune.push(childHash)
      const childBlock = blockArray.get(childHash)
      if (childBlock)
        toPrune.push(...getDescendantBlocks(childBlock, finalizedChild))
    }

    return toPrune
  }

  const onNewBlock = ({ blockHash }: NewBlockEvent) => {
    const body = api.getBody(blockHash)

    settledByBlock.set(
      blockHash,
      settledByBlock.get(blockHash) ?? new Map<string, Settled>(),
    )
    const byBlock = settledByBlock.get(blockHash)!

    for (const tx of txQueue) {
      if (byBlock.has(tx)) continue

      const inBody = body.includes(tx)

      // If tx not in body and still valid, nothing to do yet
      if (!inBody && api.isTxValid(blockHash, tx)) continue

      //  adjsutment checker
      const state: Settled =
        inBody && api.isTxValid(blockHash, tx)
          ? {
              type: "valid",
              successful: api.isTxSuccessful(blockHash, tx),
              blockHash,
            }
          : { type: "invalid", blockHash }

      byBlock.set(tx, state)
      outputApi.onTxSettled(tx, state)
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
