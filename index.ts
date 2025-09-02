import inputData from "./src/input.json"
import expectedResult from "./src/output.json"
import { evaluateSolution } from "./src/evaluate"
import daficreatella25 from "./src/solutions/daficreatella25"

const solver = evaluateSolution(inputData as any, expectedResult as any)
const score = solver(daficreatella25)
console.log("SCORE: ", score)
