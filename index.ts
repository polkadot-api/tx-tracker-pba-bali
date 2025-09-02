import inputData from "./src/input.json"
import expectedResult from "./src/output.json"
import { evaluateSolution } from "./src/evaluate"
import solution from "./src/solutions/kanasjnr"

const solver = evaluateSolution(inputData as any, expectedResult as any)
const score = solver(solution)
console.log("SCORE: ", score)
