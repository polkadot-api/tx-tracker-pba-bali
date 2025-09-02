This is what a txn block contains, and sometimes []
[
  "0xfceae8e757bb38939a05533558f0c9eed8fd754548488a4e3f03afdc568637f1", "0x1426cbbfb5bc9042671c06faa63f9781df372911744c0306199847ba7f65edea",
  "0x9f30ac278e6ff7160942b9ae5b030fb63f87fce679288ec7beaa5655f3b38ae5", "0xe9b4d0721ef2e9a095927c38c0cfec3a2a84adcfef87a5a1616ddcfcb8de94bd",
  "0xed46e037625b8a3376a9faf2f33f894424ce605a6fe927d1f34338a6baa397d6", "0x358d81031c2aafee9f1f4eece570f25f0577b470af83a743bff8163a026428e9",
  "0xed8b40fd8d95f3f999585c8403a0b4a33f1e437e7561d59eb9aff76dfe285b51", "0x2da88bf0d89b83433e7e768ab9fd1ab316ff88368e7cd11ea03442d6d020772e",
  "0xe9553ec5e3ff92274b017dfe0ca93a8287d90dabf575b858df29d0b02cd64618", "0xab2600c341137e9134269f09bb43560d40cc1c1e2c587c46113f48799172d861",
  "0x957f8b42851cdaf7ae217fd671e8e3cf56243cecf5aa6a796987ef1c62089f66", "0x04ff0ee86e1192fc959d6d49c1f58c1f18bd288f53a5466b0d78ab735fafc397",
  "0x4806ba3b3d6b1f435af4b4ffa4732cd33021ee37107f62d612ceb15f3b572001", "0x0bcee7230265fc15fa1ee2a45b484286e81e5e423304f518a082a090dc38f893",
  "0xe13cd9905f0b34ba39c55e6e04489149a2f6ece4aeaeacbcf060eedbf6234a05", "0xb556013b4a14d8b27cc8c5635c6a5b362e7444a4488236ef8d9e3c5edf25b462",
  "0xd28384ca0868c8194fc2f586482d881ee3c58b1f7e76243c20398d963b257b17", "0xbc1e2ff02217d21bd4daa6964bd36782b4a4e22b67cc99fadd22ac860095ed77",
  "0x4347832f91165744437c90371e782a3ad1f2efadb84e4b563202dcca1e0e3f9e", "0x1a904d4e7e86cfa7fa5ef4bf1dceaea5dcb034cd39820ef8a65b364a67765739",
  "0x9f89d95a48c5355b838bfc6a6f23b58b4cc74e64b6b0743906c834c0cb055435", "0x9e567ebd5815ce44adceb6a51d215b20c260a3d6e50a9602b5f2432ab61647f6",
  "0x7cff182fd8b5d28a52143b437672750425ee9859ca401a843e011c335da42f00", "0x55690e827f1b9468092df452990bff6bae41357b82f9156eec558b9c8a9435ef",
  "0xbd03d65b836a308eab5fc506ad2d295b77f3d2b4d31ba01c39081d7b3b1a659c", "0x34895940b5121d87b02f343fee4e71025a0a8a463b1786d29c5b57ffc9d5d476",
  "0x8ecba2daf6e59a8f189852e521c394ee7da8c629cb4f30f477e919e83b77029e", "0x0d15a21af7457f4888145eaa046ee5bf725ec2179e5ddc7f6906371330455988",
  "0x7937928917d43afeaf09e067302bfa199053a294e92293af183d70c29334838e", "0x246e46f2df2ed1a1c1719cbed9b3bb85c695d6d379efec8f3b887a91d900c5af",
  "0x913d73d97fc8e2c3bb2ca3122890bc00ceaa6ca9d27bc0d7c43e2a4b29114dd5", "0xe1698f963b07be30cf547af55d9e8d3f537ac5f34d5f7a02f7972876b82bd7f4",
  "0xfe41d3d265cd9fccc673649c4b91a3248439a4c64fe761511982f93ce00fe388", "0x54394b5b527abd30c714178e0b64d2c9cac48fdf04ce521bc2788df622e787b4",
  "0x9c314ebd88e0aea884f983a936128187a57681898e6881cbdfb2047ef23c0812", "0x9791168692731b7b7297f2b62add10182cd77babc5f7d34d76ce466054acc278",
  "0x7c36617a6e8c8d98122b9d9c6176c66986e3fe04d9a4585ba3db7fa5ea164bd6", "0x6de5cf1362a2e8b470a857912dc9c8b5a206f96c811023db8d6d9a3c03ee8614"
]


The some txn are repeated in multiple blocks.

As soon as a block gets finalized, all the txns it has should be "done" -> call onTxDone.
I get "finalized" event, there i get a blockhash, 
using api i can get all txns in blockhash,

with that, i can loop over all txns and set each and every txn "done"

Ok problem is, txn order
Ok will store the txn in array and use that to call onTxDone.

Faced a problem maybe because i am calling onTxSettled or onTxDone more than once and that cant be done.

So i need to keep track of settled Txns

The thing is when a finalized block event comes, there can be many blocks behind it, the txns inside those also need to be finalized.
So keeping a mapping of blockToParentMapping, which will help me retrieve all the parents which need to be finalized

Made a major mistake, trying to settle txns of a different block in the finalized block and rejecting it

Most important  
Transaction Life Cycle:
For each transaction:
  Track it inside incoming blocks, until there is a finalized block where the transaction is either:
    Included
    Invalid

i was only chekcing txnx that appead in block body and settingly them, but ignorning the queud.
Now checking for every queuedTxns, before finalizing, and in the block that it appearedIn

Mindmap: 
tx1: arrived → settled → done
Block: arrived → finalized
