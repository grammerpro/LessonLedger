# Evidence quality and evaluation

## Release target, set before live evaluation

Evaluate at least 100 independently human-labeled lesson/reference pairs with at least 25 real changes and 25 unchanged/irrelevant pairs. Include renamed features, conflicting official sources, historical product versions, plan differences, removed controls and broken references. Two reviewers should adjudicate disagreements without seeing the model output first.

The launch target is at least **95% precision**, at least **80% recall on labeled changes**, and **zero fabricated quotations or locations**. Report coverage and inconclusive rates separately. Record median human review time against a manual review baseline; do not claim a time saving without that measurement. A small sample is not sufficient to estimate production behavior reliably.

## What is currently evaluated

The deterministic sample adapter recognizes three fictional Folio changes. Fixtures also include unchanged instructions, irrelevant reference changes, hostile input and quote/location mismatches. Service tests measure structural rejection and deterministic deduplication. They do **not** establish live model precision, recall, historical-version reasoning or contradiction handling. The sample is a product demonstration, not a production-quality benchmark.

The live adapter uses Responses structured output, validates every finding against the captured lesson and source text, and allows inconclusive results. Those checks establish that a quote exists, not that the implied change is correct. The system instructions require attention to product versions, plans, ambiguity and conflicting references, but this reasoning remains unverified until the live evaluation passes.

## Evaluation procedure

1. Obtain authorized lessons and official references. Store the private corpus outside the repository and redact personal data.
2. Freeze each lesson version, source snapshot, product/version scope, and label. Label the smallest meaningful location, acceptable category, and whether a proposed edit is warranted.
3. Run the exact configured model, input bounds, and prompt used by the worker. Record model ID, date, parameters, token usage, retained source hashes and failures.
4. Match valid findings to adjudicated labels. Compute true positives, false positives and misses. Precision = TP/(TP+FP); recall = TP/(TP+FN). Report denominators, confidence intervals and excluded/inconclusive cases.
5. Break out results by version/plan conflicts, unchanged text, irrelevant updates and actual changes. Retain rejected quotes and hallucinated proposals as failures, not filtered successes.
6. Time reviewers on a randomized set with and without the review workspace. Record sample size and uncertainty.
7. Approve a model only after targets pass; rerun after model, prompt, source extraction or retrieval changes.

## Pending evidence

No live model evaluation or independent human labeling has been performed in this build environment. No numeric confidence score or live precision claim is displayed. The bounded-prefix retrieval strategy is a known limitation: long or insufficient source excerpts remain inconclusive rather than being declared fully checked.
