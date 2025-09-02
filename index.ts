import inputData from "./src/input.json"
import expectedResult from "./src/output.json"
import { evaluateSolution } from "./src/evaluate"
import solution from "./src/solutions/marsian83"

const solver = evaluateSolution(inputData as any, expectedResult as any)
const score = solver(solution)
console.log("SCORE: ", score)
