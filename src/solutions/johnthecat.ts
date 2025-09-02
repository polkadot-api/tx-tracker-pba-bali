import type {
    API,
    FinalizedEvent,
    IncomingEvent,
    NewBlockEvent,
    NewTransactionEvent,
    OutputAPI,
    Settled,
} from "../types"

export default function johnthecat(api: API, outputApi: OutputAPI) {
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

    type Block = {
        hash: string
        parent?: string
        children: string[]
        finalized: boolean
    }

    function createBlock(
        map: Record<string, Block>,
        hash: string,
        parent?: string,
    ): Block {
        const block: Block = {
            hash: hash,
            parent: parent,
            children: [],
            finalized: false,
        }

        if (parent) {
            const parentBlock = map[parent]
            if (parentBlock) {
                parentBlock.children.push(hash)
            }
        }

        return block
    }

    function pruneBranch(map: Record<string, Block>, block: Block): Block[] {
        let pruned: Block[] = [block]

        for (const child of block.children) {
            const childBlock = map[child]
            if (childBlock) {
                pruned = pruned.concat(pruneBranch(map, childBlock))
            }
        }

        return pruned
    }

    function finalizeBlock(map: Record<string, Block>, block: Block) {
        let pruned: Block[] = []
        let finalized: Block[] = []

        if (block.finalized) return { finalized, pruned }
        block.finalized = true
        finalized.push(block)

        // branching found, prune
        if (block.parent) {
            const parentBlock = map[block.parent]

            if (parentBlock && parentBlock.children.length > 1) {
                for (const sibling of parentBlock.children) {
                    const siblingBlock = map[sibling]
                    if (siblingBlock && siblingBlock.hash !== block.hash) {
                        pruned = pruned.concat(pruneBranch(map, siblingBlock))
                    }
                }
            }

            const parentFinalized = finalizeBlock(map, parentBlock)

            pruned = pruned.concat(parentFinalized.pruned)
            finalized = finalized.concat(parentFinalized.finalized)
        }

        return { pruned, finalized }
    }

    const blocks: Record<string, Block> = {}

    let pendingTransactions: Set<string> = new Set()
    const settledTransactions: Map<string, string[]> = new Map()

    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
        blocks[blockHash] = createBlock(blocks, blockHash, parent)

        if (pendingTransactions.size > 0) {
            const body = api.getBody(blockHash)
            const processed: string[] = []

            for (const transaction of pendingTransactions) {
                if (body.includes(transaction)) {
                    pendingTransactions.delete(transaction)
                    processed.push(transaction)

                    const state: Settled = api.isTxValid(blockHash, transaction)
                        ? {
                              blockHash,
                              type: "valid",
                              successful: api.isTxSuccessful(
                                  blockHash,
                                  transaction,
                              ),
                          }
                        : {
                              blockHash,
                              type: "invalid",
                          }
                    outputApi.onTxSettled(transaction, state)
                } else if (!api.isTxValid(blockHash, transaction)) {
                    const state: Settled = {
                        blockHash,
                        type: "invalid",
                    }
                    outputApi.onTxSettled(transaction, state)
                }
            }

            settledTransactions.set(blockHash, processed)
        }
    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
        pendingTransactions.add(transaction)
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
        const block = blocks[blockHash]
        if (!block) {
            return
        }

        const { finalized, pruned } = finalizeBlock(blocks, block)

        for (const b of pruned) {
            delete blocks[b.hash]
        }

        for (const block of finalized) {
            const settled = settledTransactions.get(block.hash)
            settledTransactions.delete(block.hash)

            if (settled) {
                for (const transaction of settled) {
                    const state: Settled =
                        api.isTxValid(block.hash, transaction) &&
                        api.isTxSuccessful(block.hash, transaction)
                            ? {
                                  blockHash: block.hash,
                                  type: "valid",
                                  successful: true,
                              }
                            : {
                                  blockHash: block.hash,
                                  type: "invalid",
                              }

                    outputApi.onTxDone(transaction, state)
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
