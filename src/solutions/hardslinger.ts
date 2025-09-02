import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"

export default function hardslinger(api: API, outputApi: OutputAPI) {

  const txSequence = new Array<string>();
  const blockToTxs = new Map<string, string[]>();

  const chain = new Map<string, string[]>();


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
      
      buildChain(blockHash, parent)
      const blockTxs = getTxs(blockHash)
      
      if (blockTxs.length > 0) console.log("new Block", blockHash)
      blockTxs.forEach(tx => console.log(". ", tx, api.isTxValid(blockHash, tx)))

      txSequence.forEach((tx, index) => {
        const valid = api.isTxValid(blockHash, tx)
        if (!valid) { //not right
          outputApi.onTxSettled(tx, {blockHash: blockHash, type: "invalid"})
          
        }
        if (blockTxs.includes(tx)) {
          const state = api.isTxSuccessful(blockHash, tx)
          outputApi.onTxSettled(tx, {blockHash: blockHash, type: "valid", successful: state})
          
        }
        
      })
      /*
      if (blockTxs.length > 0)
        console.log(blockTxs)
      blockTxs.forEach((tx) => {
        const valid = api.isTxValid(blockHash, tx)
        const isTxSuccessful = api.isTxSuccessful(blockHash, tx)
        //console.log(`${tx}  ${valid} ${isTxSuccessful}`)
      })
      */
      
    }


    
    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      // TODO:: implement it
      //console.log("tx: ", transaction)
      txSequence.push(transaction) // TODO most likely filter invalid here
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      // TODO:: implement it
      console.log(`Finalized ${blockHash}`)
      finalize(blockHash)
      chain.clear() // TODO prune unpin first
    }

    /**
     * 
     * @param blockHash the block to finalize from
     */
    function finalize(blockHash: string) {
      // a block got finalized, so walk the tree and find the canonical path
      const canonicalChain = findCanonicalChain(blockHash, [])
      //console.log(canonicalChain)
      canonicalChain.toReversed()
      .forEach(block => {
        const blockTxs = getTxs(blockHash)
      txSequence.forEach((tx, index) => {
        
        if (blockTxs.includes(tx)) {
          const state = api.isTxSuccessful(blockHash, tx)
          outputApi.onTxDone(tx, {blockHash: blockHash, type: "valid", successful: state})
          
        }
        
      })

    })


    }
    
    function findCanonicalChain(blockHash: string, path: Array<string> | []): string[] {
      //const successors = chain.get(blockHash)
      //console.log(`successors: ${blockHash} -> ${successors}`)
      if (blockHash == "") return path
      else {
        const parent = chain.entries().find((kv) => kv[1].includes(blockHash))
        if (parent === undefined) return path
        else {
        //console.log("parent", parent)
  
  
        return findCanonicalChain(parent?.[0]!, [parent?.[0]!, ...path])
        }

      }
      
   
      
    }

    function buildChain(block: string, parent: string) {
      const successors = chain.get(parent) ?? []
      successors.push(block)
      chain.set(parent, successors)
      //chain.entries().forEach(console.log)
    }

    function getTxs(blockHash: string): string[] {
      if (blockToTxs.has(blockHash)) return blockToTxs.get(blockHash)!;
      else {
        const txs = api.getBody(blockHash);
        blockToTxs.set(blockHash, txs);
        return txs
      }

    }

    return (event: IncomingEvent) => {
      switch (event.type) {
        case "newBlock": {
          onNewBlock(event)
          //console.log("newEvent", event);
          break
        }
        case "newTransaction": {
          //console.log("newTx", event);
          
          onNewTx(event)
          break
        }
        case "finalized":
          //console.log("Finalized", event);
          onFinalized(event)
      }
    }
}
