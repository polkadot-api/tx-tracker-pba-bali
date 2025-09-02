export type Settled = {
  blockHash: string
} & (
  | {
      type: "invalid"
    }
  | { type: "valid"; successful: boolean }
)

export type NewTransactionEvent = {
  type: "newTransaction"
  value: string
}

export type NewBlockEvent = {
  type: "newBlock"
  blockHash: string
  parent: string
}

export type FinalizedEvent = {
  type: "finalized"
  blockHash: string
}

export type IncomingEvent = NewTransactionEvent | NewBlockEvent | FinalizedEvent

export type API = {
  getBody: (blockHash: string) => string[]
  isTxValid: (blockHash: string, transaction: string) => boolean
  isTxSuccessful: (blockHash: string, transaction: string) => boolean
  unpin: (blocks: string[]) => void
}

export type OutputAPI = {
  onTxSettled: (transaction: string, state: Settled) => void
  onTxDone: (transaction: string, state: Settled) => void
}

export type Solution = (
  api: API,
  outputApi: OutputAPI,
) => (event: IncomingEvent) => void
