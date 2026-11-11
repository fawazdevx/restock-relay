# Restock Relay: shop-owner walkthrough

## The short pitch

Imagine you run a food shop in Yaba. You need tomatoes, rice and pepper, but buying a small quantity by yourself can leave you with less bargaining power. Restock Relay helps nearby shops combine orders for similar goods, compare supplier offers, and see each shop’s share before anyone approves.

You set your own limit. You keep the final say over your shop’s order. You do not need to understand AI or crypto to follow this demo.

**What you are seeing today:** the shops, software buyers and supplier offers are prepared demo examples. The purchase is simulated. No supplier is contacted and no money moves. If the NEAR testnet contract has been deployed, the optional wallet step records an approval on testnet; it still does not pay a supplier.

## Take a buying round

1. Open `http://localhost:3000`. On the Restock Relay welcome page, click **Open the buying desk**.
2. You land on the **Overview** page. Click **Run seeded demo** in the upper-right corner. Restock Relay brings together sample orders from three Lagos shops and asks five sample suppliers for offers. Wait a few seconds for the round to finish.
3. The app opens **Procurement round**. Scroll to **Supplier quotes**. Compare the total price, delivery time and trust evidence. The offer marked **Selected** is the one that best balances those factors; the short explanation below the table tells you why it won.
4. Under the quote comparison, click **Test supplier withdrawal**. Lagos Fresh’s offer changes to **WITHDREW**; the app removes it from selection and re-ranks the remaining eligible offers. Read the disruption note and compare the new winner. This is a prepared scenario, not a live supplier update.
5. Scroll to **Shop allocations**. Find the row marked **YOUR SHOP**. It shows your share and an estimated saving against a modeled buy-alone baseline; it is not a guaranteed market saving. Click **Review & authorize**.
6. In **Authorize your share?**, check the amount, supplier, policy and expiry. Click **Authorize my shop’s share** to record the demo approval. This button does not charge your wallet or send money.
7. Open **Receipts & audit** from the left menu on a computer, or tap **Audit** in the bottom menu on a phone. Find the round receipt. Confirm it names the selected supplier, shows the policy result and says the payment is simulated. There should be no transaction link for the simulated payment.

## Try an order for your own shop

1. From the Overview or another buying-desk page, click **Create restock**. You can also open **Restock requests** and click **New restock**.
2. In the form, enter what you want to buy, how much you need, the highest unit price you will accept, your order limit and delivery deadline. Choose which suppliers you allow. These are your shop’s boundaries.
3. Click **Save restock request**. The app takes you to **Restock requests** and highlights your saved request.
4. On that request card, click **Pool this request**. The app checks which sample shop orders can be combined, gathers sample supplier offers and opens **Procurement round** so you can review the result.

## Check how it handles a bad supplier offer

1. Open **Security & policy** from the left menu, or tap **Security** in the phone menu.
2. In the **Try a policy attack** card, click **Submit hostile supplier quote**. If you have already run it, the button says **Replay attack demo**.
3. Read the blocked result and the reason list. The sample supplier offers an unacceptable deal and includes text telling the software to ignore your limits. The app treats that text as a supplier note; it does not change your rules.
4. Click **Engage emergency stop**. Confirm that the round and approval buttons are paused. Click **Release emergency stop** to resume the demo.

## Optional: approve the record on NEAR testnet

Do this only after the contract has been deployed and `NEXT_PUBLIC_NEAR_TESTNET_CONTRACT_ID` is set. In **Receipts & audit**, find **Authorize a frozen shop share**, click **Connect wallet**, then choose **NEAR CLI**. Click **Prepare testnet approval**, review the shop, amount, supplier and hashes, then click **Sign & commit on NEAR**. Copy the command shown by the connector into your terminal and run it. Return the transaction hash as instructed. The receipt should show a testnet transaction link. The current wallet walkthrough signs one connected demo shop; the other shops remain sample entries. This records an approval; the purchase remains simulated.

## Find the pages

- On a computer, use the left menu: **Overview**, **Restock requests**, **Procurement round**, **Security & policy**, and **Receipts & audit**.
- On a phone, use the bottom menu: **Home**, **Requests**, **Round**, **Security**, and **Audit**.
- To start over, click the circular-arrow **Reset demo** button near **Run seeded demo**.
