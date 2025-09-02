import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
} from "../types"


const bodies: Record<string, string[]> = {}
const seenBlocks = new Set<string>()
const seenTxs = new Set<string>()


export default function divljo31(api: API, outputApi: OutputAPI) {
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

      const blockBody = api.getBody(blockHash)
      bodies[blockHash] = blockBody
      seenBlocks.add(blockHash)

      for(const tx of blockBody){
        if(!seenTxs.has(tx)){
          onNewTx({
            type: "newTransaction",
            value: tx
          })
        }

        if(blockBody.includes(tx)){
          if(api.isTxValid(blockHash, tx)){
            if(api.isTxSuccessful(blockHash,tx)){
              outputApi.onTxSettled(tx, {blockHash, type:"valid", successful: true});
              seenTxs.delete(tx);
            } else {       
              outputApi.onTxSettled(tx,{blockHash, type:"valid",successful: false});
              seenTxs.delete(tx);
            }
          } else {
            outputApi.onTxSettled(tx, {blockHash, type: "invalid"});
          }
        }
      }
      if(seenTxs.size !== 0){
        seenTxs.forEach(tx => outputApi.onTxSettled(tx, {blockHash, type: "invalid"}));
        seenTxs.clear();
      }
    }

    const onNewTx = ({ value: transaction }: NewTransactionEvent) => {
      if (!seenTxs.has(transaction)) {
        seenTxs.add(transaction)
      }
    
    }

    const onFinalized = ({ blockHash }: FinalizedEvent) => {
      // TODO:: implement it
      const finalizedBody = api.getBody(blockHash)

      for(const tx of finalizedBody){
          if(api.isTxValid(blockHash, tx)){
            if(api.isTxSuccessful(blockHash,tx)){
              outputApi.onTxDone(tx, {blockHash, type:"valid", successful: true});
            } else {         
              outputApi.onTxDone(tx,{blockHash, type:"valid",successful: false});
            }
          }
          else{ 
           outputApi.onTxDone(tx, {blockHash, type: "invalid"});
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
