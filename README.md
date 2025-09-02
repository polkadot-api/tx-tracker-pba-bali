# 🚀 Transactions Tracker Challenge

## 📥 How to Work on and Submit Your Solution

1. **Fork** this repository and **clone** it to your local development environment.
2. Complete as much of the challenge as you can **before Tuesday, April 1st at 17:00 CET**.
3. **Do not make your solution public before the deadline.**

### ✅ Submitting Your Solution

When you're ready to submit:

- Submit a `System.Remark` transaction on **Polkadot**, **Kusama**, **Westend**, or **Paseo**.
- The remark content must follow this format:

  ```rust
  System.Remark(`${YOUR_GH_HANDLE}` `${COMMIT_HASH_OF_YOUR_SOLUTION}`)
  ```

- You may submit the remark **any time before** Tuesday, September 2nd at 17:00 WITA.
- After the deadline:
  - Push your commit to your GitHub fork.
  - Open a **pull request** against this repository.
  - In the PR, include a comment with a **link to a block explorer** where your `System.Remark` transaction can be verified.

---

## 🛠 How to Solve the Challenge

1. Rename the file:
   ```
   ./src/solutions/template.ts → ./src/solutions/${YOUR_GH_HANDLE}.ts
   ```
2. Rename the exported function in that file accordingly.
3. Follow the instructions and requirements described within that same file.

---

## 🧮 Scoring Breakdown

| Criteria                                                   | Points                  |
| ---------------------------------------------------------- | ----------------------- |
| ✅ Emits `onTxSettled` and `onTxDone` correctly            | 7 pts                   |
| 🔍 Optimal use of `getBody`, `isTxValid`, `isTxSuccessful` | Up to 1.5 pts           |
| 🧹 Proper unpinning of blocks                              | 1.5 pts                 |
| 💡 Partial implementation or code quality                  | Partial points possible |
| 🚫 Use of AI tools or detected plagiarism                  | 0 pts                   |

> **Note:** We value original work. Plagiarism or use of AI-generated solutions will result in disqualification.

---

## 🧪 Testing Your Score

- You can test your solution by modifying `index.ts` to import your implementation.
- Run your tests with:

  ```bash
  bun index.ts
  ```

- Final scoring will be performed using a larger internal test suite.
