import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

export default function sairanjit(api: API, outputApi: OutputAPI) {
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

  let transactionPool: {
    index: number,
    transaction: string,
    isTxSettled: boolean
  }[] = []

  const blockHashTreeMap: Record<string, string[]> = {

  }

  const currentTrackingBlocks: string[] = []

  let currentFinalizedBlock = ""

  interface Block {
    blockHash: string
    parentHash: string
    transactions: string[]
    children: Block[]
  }

  const chainMap: Record<string, Block> = {

  }

  const blocksArray: Block[] = []

  const transactionIdx = 0

  const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
    // TODO:: implement it
    // const isInCurrentTrackingBlocks = currentTrackingBlocks.find(blk => blk === blockHash)
    const transactionsInBlock = api.getBody(blockHash)

    const parentBlock = blocksArray.find(blk => blk.parentHash === parent)
    const blockHashMatched = blocksArray.find(blk => blk.blockHash === parent)
    // console.log("🚀 ~ onNewBlock ~ blocksArray:", blocksArray)
    if (parentBlock) {
      parentBlock.children.push({
        blockHash,
        parentHash: parent,
        transactions: transactionsInBlock,
        children: [],
      })
    } else if (blockHashMatched) {
      blocksArray.push({
        blockHash,
        parentHash: parent,
        transactions: transactionsInBlock,
        children: [],
      })
    } else {
      blocksArray.push({
        blockHash,
        parentHash: parent,
        transactions: transactionsInBlock,
        children: [],
      })
    }

    transactionsInBlock.forEach(transaction => {
      const tx = transactionPool.find(tx => tx.transaction === transaction)!

      // if (!tx || tx.isTxSettled) {
      //   return
      // }

      const isTxSuccessful = api.isTxSuccessful(blockHash, transaction)

      outputApi.onTxSettled(transaction, isTxSuccessful ? { blockHash, type: "valid", successful: true } : { blockHash, type: "invalid" })

      // const index = transactionPool.findIndex(tx => tx.transaction === transaction)
      // transactionPool[index].isTxSettled = true
    })
  }

  const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
    // console.log("🚀 ~ onNewTx ~ transaction:", transaction)
    // TODO:: implement it
    const isTxValid = api.isTxValid(currentFinalizedBlock, transaction)
    // if (isTxValid) {
    transactionPool.push({
      index: transactionIdx,
      transaction,
      isTxSettled: false,
    })
    // }
  }

  const onFinalized = ({ blockHash }: FinalizedEvent) => {
    // TODO:: implement it
    currentFinalizedBlock = blockHash
    // const blockTransactions = blockHashTreeMap[blockHash]
    // const blockTransactions = blocksArray.find(block => block.hash === blockHash)?.transactions
    const blockTransactions = api.getBody(blockHash)
    blockTransactions.forEach((transac) => {
      const isTxSuccessful = api.isTxSuccessful(blockHash, transac)
      outputApi.onTxDone(transac, isTxSuccessful ? { blockHash, type: "valid", successful: true } : { blockHash, type: "invalid" })
    })
    // api.unpin([blockHash])
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