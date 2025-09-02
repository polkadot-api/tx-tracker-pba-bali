import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

export default function mathigertner(api: API, outputApi: OutputAPI) {
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
  const pendingTransactions: string[] = []
  const blockChain: Map<string, { parent?: string; blockHash: string }> =
    new Map()
  const finalizedBlocks: Set<string> = new Set()

  const onNewTransaction = ({ value: transaction }: NewTransactionEvent) => {
    if (!pendingTransactions.includes(transaction)) {
      pendingTransactions.push(transaction)
    }
  }

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    const toRemove: number[] = []
    const blockTxs = api.getBody(blockHash)

    // Store block information with parent reference
    blockChain.set(blockHash, { parent, blockHash })

    // Process transactions in arrival order - process all transactions in this block
    for (let i = 0; i < pendingTransactions.length; i++) {
      const tx = pendingTransactions[i]

      if (blockTxs.includes(tx)) {
        // Transaction settles in this block
        let state: any

        const successful = api.isTxSuccessful(blockHash, tx)
        state = {
          blockHash,
          type: "valid",
          successful,
        }

        outputApi.onTxSettled(tx, state)
      }
    }

    // Remove finalized transactions in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      pendingTransactions.splice(toRemove[i], 1)
    }
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // When a block is finalized, all blocks in the chain up to that block are also finalized
    const finalizedChain = buildChainFromBlock(blockHash)

    // Mark all blocks in the chain as finalized
    for (const block of finalizedChain) {
      if (!finalizedBlocks.has(block)) {
        finalizedBlocks.add(block)
      }
    }

    // Process pending transactions that are in finalized blocks
    const toRemove: number[] = []

    for (let i = 0; i < pendingTransactions.length; i++) {
      const tx = pendingTransactions[i]

      // Check if transaction belongs to the finalized chain
      let belongsToFinalizedChain = false
      let txBlockHash = ""

      for (const chainBlock of finalizedChain) {
        const chainBlockTxs = api.getBody(chainBlock)
        if (chainBlockTxs.includes(tx)) {
          belongsToFinalizedChain = true
          txBlockHash = chainBlock
          break
        }
      }

      if (belongsToFinalizedChain) {
        // Get the state for this transaction
        let state: any

        const successful = api.isTxSuccessful(txBlockHash, tx)
        state = {
          blockHash: txBlockHash,
          type: "valid",
          successful,
        }

        outputApi.onTxDone(tx, state)
        toRemove.push(i)
      }
    }

    // Remove finalized transactions in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      pendingTransactions.splice(toRemove[i], 1)
    }
  }

  const buildChainFromBlock = (blockHash: string): string[] => {
    const chain: string[] = []
    let current = blockHash
    while (current) {
      chain.unshift(current)
      const blockInfo = blockChain.get(current)
      current = blockInfo?.parent || ""
    }
    return chain
  }

  return (event: IncomingEvent) => {
    switch (event.type) {
      case "newBlock": {
        onNewBlock(event)
        break
      }
      case "newTransaction": {
        onNewTransaction(event)
        break
      }
      case "finalized":
        onFinalized(event)
    }
  }
}
