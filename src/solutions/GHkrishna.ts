import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
} from "../types"

interface Block {
  hash: string,
  parent: string,
  child: Array<string>,
  finalized: boolean,
  transactions: string[]
}

class BlockManager {
  private blocks: Map<string, Block> = new Map();

  // Add block
  addBlock(block: Block) {
    this.blocks.set(block.hash, block);
  }

  // Get block by parent
  getBlocksByParent(parentHash: string): Block[] {
    return Array.from(this.blocks.values()).filter(block => block.parent === parentHash);
  }

  // Delete block and its subtree
  deleteBlock(blockHash: string) {
    const block = this.blocks.get(blockHash);
    if (block) {
      this.blocks.delete(blockHash);
      block.child.forEach(child => this.deleteBlock(child));
    }
  }

  // Get blockById
  getBlockById(blockHash: string): Block | undefined {
    return this.blocks.get(blockHash);
  }

  // Update block
  updateBlock(blockHash: string, updatedBlock: Partial<Block>) {
    const block = this.blocks.get(blockHash);
    if (block) {
      this.blocks.set(blockHash, { ...block, ...updatedBlock });
    }
  }

  // Get block and blockSubtree
}

export default function GHkrishna(api: API, outputApi: OutputAPI) {

  const blockManager = new BlockManager();



  const txMap = new Map<string, { blockHash: string, finalizedBlockHash: string, settled: boolean; done: boolean }>();
  const finalizedBlockMap: string[] = [];
  let latestFinalizedBlock: string;
  const blockMap = new Map<string, { parent: string; finalized: boolean; safeToDelete: boolean }>();

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

    const onNewBlock = ({ blockHash, parent }: NewBlockEvent) => {
      // TODO:: implement it
      // Check for transactions included, these are finalized transactions
      const newBlockTxs = api.getBody(blockHash)
      let parentDetails

      const newBlock = {
        hash: blockHash,
        parent,
        child: [],
        finalized: false,
        transactions: newBlockTxs
      }

      blockManager.addBlock(newBlock);

      if (parent) {
        parentDetails = blockManager.getBlockById(parent)
      }

      // I'm considering, that since it is a new block, it won't be included and so we would always include it
      if (parentDetails) {
        // if (childBlock) { // Not sure, if we need to have this check, as irrespective of this, we would push the child anyway
        parentDetails.child.push(blockHash);
        // }
      }

      // Do I need a helper, to track all the transactions in this block and validate it against finalized ones
      // If valid as the transaction is not already present (Ig those two are the same things, we can call the onsettled call)
      newBlockTxs.forEach((tx) => {
        // Check if the transaction is already included in any finalized block
        const txDetails = txMap.get(tx);
        if (txDetails && !txDetails.settled ) {
          // Check transaction valid
          txDetails.settled = true;
          let settleMentDetails: Partial<Settled> = {blockHash}
          if (api.isTxValid(blockHash, tx) && api.isTxSuccessful(blockHash, tx)) { 
            settleMentDetails = { ...settleMentDetails, type: "valid", successful: true}
            txMap.set(tx, {
              blockHash, settled: true, done: false,
              finalizedBlockHash: ""
            });
          }
          else {
            settleMentDetails = { ...settleMentDetails, type: "invalid"}
            txMap.delete(tx)
          }
          outputApi.onTxSettled(tx, {...settleMentDetails as Settled})
        }
      })


      // Maintain order of transactions and event calls
    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      // TODO:: implement it
      // Check if it is already included in any block that is finalized?
      // i.e. check against current state
      const transactionValidity = api.isTxValid(latestFinalizedBlock, transaction)

      txMap.set(transaction, {
        blockHash: "",
        settled: false,
        done: false,
        finalizedBlockHash: ""
      })
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      // TODO:: implement it

      latestFinalizedBlock = blockHash

      // Call outputApi.onTxDone
      const finalizedTxs = api.getBody(blockHash)
      
      // Delete all the siblings blocks


      // emit event for all transactions:
      finalizedTxs.forEach((tx) => {
        outputApi.onTxDone(tx, { blockHash, type: "valid", successful: true })
      })


      // Prune all the blocks with the same parent as this one and the subtree below it
      // finalizedTxs.forEach((tx) => {
      //   const block = blockMap.get(tx.blockHash)
      //   if (block && block.parent === blockHash) {
      //     blockMap.delete(tx.blockHash)
      //   }
      // })



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
