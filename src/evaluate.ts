import type {
  API,
  FinalizedEvent,
  IncomingEvent,
  NewBlockEvent,
  NewTransactionEvent,
  OutputAPI,
  Settled,
  Solution,
} from "./types"

const getSolverFromInput = ({
  events,
  transactions,
}: {
  events: Array<NewBlockEvent | FinalizedEvent | NewTransactionEvent>
  transactions: Record<string, Record<string, "invalid" | "ok" | "ko">>
}) => {
  const bodies: Record<string, string[]> = {}
  const seenBlocks = new Set<string>()
  const seenTxs = new Set<string>()

  Object.entries(transactions).forEach(([tx, states]) => {
    Object.entries(states)
      .map(([blockHash, type]) => ({ type, blockHash }))
      .filter((x) => x.type !== "invalid")
      .forEach(({ blockHash }) => {
        const body = bodies[blockHash] ?? []
        body.push(tx)
        bodies[blockHash] = body
      })
  })

  return (
    solution: (
      api: API,
      outputApi: OutputAPI,
    ) => (event: IncomingEvent) => void,
  ) => {
    let idx = 0
    const unpins: Array<{ idx: number; blocks: string[] }> = []

    const outputEvents: Array<{
      idx: number
      type: "setted" | "done"
      transaction: string
      state: Settled
    }> = []

    let nGetBodyCalls = 0
    let nIsTxValidCalls = 0
    let nIsTxSuccessfulCalls = 0

    const solutionOutput = solution(
      {
        getBody(blockHash) {
          if (!seenBlocks.has(blockHash)) throw new Error("Unknown block")
          nGetBodyCalls++
          return bodies[blockHash] ?? []
        },
        isTxValid(blockHash, transaction) {
          if (!seenBlocks.has(blockHash)) throw new Error("Unknown block")
          if (!seenTxs.has(transaction)) throw new Error("Unknown Transaction")
          nIsTxValidCalls++
          return !(transactions[transaction][blockHash] === "invalid")
        },
        isTxSuccessful(blockHash, transaction) {
          if (!seenBlocks.has(blockHash)) throw new Error("Unknown block")
          if (!seenTxs.has(transaction)) throw new Error("Unknown Transaction")
          if (!bodies[blockHash].includes(transaction))
            throw Error("Transaction not in block")
          nIsTxSuccessfulCalls++
          return transactions[transaction][blockHash] === "ok"
        },
        unpin(blocks) {
          unpins.push({ idx, blocks })
        },
      },
      {
        onTxDone: (transaction, state) => {
          outputEvents.push({
            type: "done",
            transaction,
            state,
            idx,
          })
        },
        onTxSettled: (transaction, state) => {
          outputEvents.push({
            type: "setted",
            transaction,
            state,
            idx,
          })
        },
      },
    )

    events.forEach((val, _idx) => {
      idx = _idx
      if (val.type === "newBlock") seenBlocks.add(val.blockHash)
      if (val.type === "newTransaction") seenTxs.add(val.value)
      solutionOutput(val)
    })

    return {
      unpins,
      outputEvents,
      nCalls: {
        getBody: nGetBodyCalls,
        isTxSuccessful: nIsTxSuccessfulCalls,
        isTxValid: nIsTxValidCalls,
      },
    }
  }
}

export const evaluateSolution = (
  inputData: {
    transactions: Record<string, Record<string, "invalid" | "ok" | "ko">>
    events: Array<NewBlockEvent | FinalizedEvent | NewTransactionEvent>
  },
  expectedResult: ReturnType<ReturnType<typeof getSolverFromInput>>,
) => {
  const solver = getSolverFromInput(inputData)

  return (solution: Solution): number => {
    const actualResult = solver(solution)
    for (let i = 0; i < actualResult.outputEvents.length; i++) {
      if (
        !Bun.deepEquals(
          actualResult.outputEvents[i],
          expectedResult.outputEvents[i],
        )
      ) {
        console.error("Expected:", expectedResult.outputEvents[i])
        console.error("Received:", actualResult.outputEvents[i])
        return 0
      }
    }
    console.log("actual", actualResult)

    if (actualResult.outputEvents.length < expectedResult.outputEvents.length) {
      console.error("missing events")
      return 0
    }
    let result = 7

    if (actualResult.nCalls.getBody <= expectedResult.nCalls.getBody)
      result += 0.5
    else
      console.warn(
        `Unnecessary \`getBody\` calls detected (${actualResult.nCalls.getBody} > ${expectedResult.nCalls.getBody})`,
      )

    if (actualResult.nCalls.isTxValid <= expectedResult.nCalls.isTxValid)
      result += 0.5
    else
      console.warn(
        `Unnecessary \`isTxValid\` calls detected (${actualResult.nCalls.isTxValid} > ${expectedResult.nCalls.isTxValid})`,
      )

    if (
      actualResult.nCalls.isTxSuccessful <= expectedResult.nCalls.isTxSuccessful
    )
      result += 0.5
    else
      console.warn(
        `Unnecessary \`isTxSuccessful\` calls detected (${actualResult.nCalls.isTxSuccessful} > ${expectedResult.nCalls.isTxSuccessful})`,
      )

    if (actualResult.unpins.length !== expectedResult.unpins.length) {
      console.warn("No Unpinning points")
      return result
    }

    for (let i = 0; i < actualResult.unpins.length; i++) {
      const expected = expectedResult.unpins[i].blocks.sort()
      const received = actualResult.unpins[i].blocks.sort()
      if (!Bun.deepEquals(expected, received)) {
        console.warn("Expected Unpinning message:", expected)
        console.warn("Received Unpinning message:", received)
        console.warn("No Unpinning points")
        return result
      }
    }
    console.log("Perfect Unpinning!")

    result += 1.5
    return result
  }
}
