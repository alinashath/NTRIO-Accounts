/**
 * Buyable products inferred from grocery bills / past stock refills
 * (see scripts/prefill-stock-unit-costs.ts).
 *
 * Match stock by `code` or case-insensitive `name`.
 * `unitCode` should match the stock item’s display/pack unit after migration.
 * `defaultPrice` is price for one product (from the bill line).
 */
export type GroceryProductHint = {
  code?: string;
  name?: string;
  products: Array<{
    name: string;
    description?: string;
    qty: number;
    unitCode: string;
    defaultPrice?: number;
  }>;
};

/** Latest bill / expense lines that define how these groceries were bought. */
export const GROCERY_PRODUCT_HINTS: GroceryProductHint[] = [
  // Sanco Traders ST/CR/26-0272 (5 Nov 2026)
  {
    name: "Basmathi Rice",
    products: [
      {
        name: "Basmathi Rice packet",
        description: "From Sanco bill — 2 packets @ 38.89",
        qty: 1,
        unitCode: "packets",
        defaultPrice: 38.89,
      },
    ],
  },
  {
    name: "Noodles",
    products: [
      {
        name: "Noodles packet",
        description: "From Sanco bill — 6 packets @ 7.41",
        qty: 1,
        unitCode: "packets",
        defaultPrice: 7.41,
      },
    ],
  },
  {
    name: "Spaghetti",
    products: [
      {
        name: "Spaghetti packet",
        description: "From Sanco bill — 2 packets @ 31.48",
        qty: 1,
        unitCode: "packets",
        defaultPrice: 31.48,
      },
    ],
  },
  {
    name: "Pasta (Penn)",
    products: [
      {
        name: "Pasta (Penn) packet",
        description: "From Sanco bill — 2 packets @ 31.48",
        qty: 1,
        unitCode: "packets",
        defaultPrice: 31.48,
      },
    ],
  },
  {
    name: "fruit cocktail",
    products: [
      {
        name: "Fruit cocktail can",
        description: "From Sanco bill — 2 cans @ 44.44",
        qty: 1,
        unitCode: "can",
        defaultPrice: 44.44,
      },
    ],
  },
  {
    name: "Custard",
    products: [
      {
        name: "Custard 250 g",
        description: "From Sanco bill — pack @ 35.18",
        qty: 250,
        unitCode: "g",
        defaultPrice: 35.18,
      },
    ],
  },
  {
    name: "Tomato Sauce",
    products: [
      {
        name: "Tomato Sauce bottle",
        description: "From Sanco bill — 1 @ 25.93",
        qty: 1,
        unitCode: "bottle",
        defaultPrice: 25.93,
      },
    ],
  },
  {
    name: "Chile Sauce",
    products: [
      {
        name: "Chile Sauce bottle",
        description: "From Sanco bill — 1 @ 29.63",
        qty: 1,
        unitCode: "bottle",
        defaultPrice: 29.63,
      },
    ],
  },
  {
    name: "Oyster Sauce",
    products: [
      {
        name: "Oyster Sauce bottle",
        description: "From Sanco bill — 1 @ 32.41",
        qty: 1,
        unitCode: "bottle",
        defaultPrice: 32.41,
      },
    ],
  },
  {
    name: "Soy sauce",
    products: [
      {
        name: "Soy sauce bottle",
        description: "From Sanco bill — 1 @ 46.30",
        qty: 1,
        unitCode: "bottle",
        defaultPrice: 46.3,
      },
    ],
  },
  {
    code: "potatoes",
    products: [
      {
        name: "Potatoes 1 kg",
        description: "From Sanco bill — 5 kg @ 16/kg",
        qty: 1,
        unitCode: "kg",
        defaultPrice: 16,
      },
    ],
  },
  {
    name: "Peeled Tomato",
    products: [
      {
        name: "Peeled Tomato can",
        description: "From Sanco bill — 3 cans @ 22.22",
        qty: 1,
        unitCode: "can",
        defaultPrice: 22.22,
      },
    ],
  },
  {
    name: "Tomato Paste",
    products: [
      {
        name: "Tomato Paste can",
        description: "From Sanco bill — 3 cans @ 53.70",
        qty: 1,
        unitCode: "can",
        defaultPrice: 53.7,
      },
    ],
  },
  {
    code: "banana_essence",
    products: [
      {
        name: "Banana essence bottle",
        description: "From Sanco bill — 2 @ 22.22",
        qty: 1,
        unitCode: "bottle",
        defaultPrice: 22.22,
      },
    ],
  },
  {
    name: "Oregano powder",
    products: [
      {
        name: "Oregano powder packet",
        description: "From Sanco bill — 1 @ 32.41",
        qty: 1,
        unitCode: "packet",
        defaultPrice: 32.41,
      },
    ],
  },
  {
    name: "Full cream milk",
    products: [
      {
        name: "Full cream milk packet",
        description: "From Sanco bill — 3 @ 42",
        qty: 1,
        unitCode: "packet",
        defaultPrice: 42,
      },
    ],
  },

  // Produce 4 Nov 2026
  {
    name: "Cucumber",
    products: [
      {
        name: "Cucumber",
        description: "From produce bill — 4 × 16.75",
        qty: 1,
        unitCode: "pcs",
        defaultPrice: 16.75,
      },
    ],
  },
  {
    name: "Cabbage",
    products: [
      {
        name: "Cabbage",
        description: "From produce bill — 2 × 56",
        qty: 1,
        unitCode: "pcs",
        defaultPrice: 56,
      },
    ],
  },
  {
    name: "Beans",
    products: [
      {
        name: "Beans 500 g",
        description: "From produce bill — 500 g @ 45",
        qty: 500,
        unitCode: "g",
        defaultPrice: 45,
      },
    ],
  },
  {
    name: "Carrot",
    products: [
      {
        name: "Carrot 1 kg",
        description: "From produce bill — 1 kg @ 40",
        qty: 1,
        unitCode: "kg",
        defaultPrice: 40,
      },
    ],
  },
  {
    name: "Capsicum",
    products: [
      {
        name: "Capsicum",
        description: "From produce bill — 8 × 3.125",
        qty: 1,
        unitCode: "pcs",
        defaultPrice: 3.13,
      },
    ],
  },

  // Other bills / expenses
  {
    code: "toilet_tissue",
    products: [
      {
        name: "Toilet roll",
        description: "Royal toilet roll — case price ÷ 48",
        qty: 1,
        unitCode: "roll",
        defaultPrice: 5.11,
      },
      {
        name: "Tissue case (48)",
        description: "Royal toilet roll case 48 — 245.37",
        qty: 1,
        unitCode: "case",
        defaultPrice: 245.37,
      },
    ],
  },
  {
    code: "coffee",
    products: [
      {
        name: "Coffee portion",
        description: "Nescafe Classic sachets — 1.85 each",
        qty: 1,
        unitCode: "portion_pack",
        defaultPrice: 1.85,
      },
      {
        name: "Coffee pack (200)",
        description: "1 pack has 200 portions",
        qty: 1,
        unitCode: "pack",
        defaultPrice: 370,
      },
    ],
  },
  {
    name: "Z-fold hand towel",
    products: [
      {
        name: "Z-fold hand towel pack",
        description: "Fathaha FOCUS Extra — 41.67 each",
        qty: 1,
        unitCode: "pcs",
        defaultPrice: 41.67,
      },
    ],
  },
  {
    code: "apple",
    products: [
      {
        name: "Whole apple",
        description: "Expense 4×Apple = 40",
        qty: 1,
        unitCode: "fruit",
        defaultPrice: 10,
      },
      {
        name: "Apple slice",
        description: "1 apple is 8 slices",
        qty: 1,
        unitCode: "slice",
        defaultPrice: 1.25,
      },
    ],
  },
  {
    code: "orange",
    products: [
      {
        name: "Whole orange",
        description: "Expense 8×Orange = 50",
        qty: 1,
        unitCode: "fruit",
        defaultPrice: 6.25,
      },
      {
        name: "Orange slice",
        description: "1 orange is 8 slices",
        qty: 1,
        unitCode: "slice",
        defaultPrice: 0.78,
      },
    ],
  },
  {
    code: "canned_tuna",
    products: [
      {
        name: "Tuna can",
        description: "Expense 5×Tuna Can = 86",
        qty: 1,
        unitCode: "pcs",
        defaultPrice: 17.2,
      },
      {
        name: "Tuna case (48 cans)",
        description: "Case of 48 cans",
        qty: 48,
        unitCode: "pcs",
        defaultPrice: 825.6,
      },
    ],
  },
  {
    code: "bread",
    products: [
      {
        name: "Bread loaf (12 slices)",
        description: "Expense Bread = 25 MVR",
        qty: 1,
        unitCode: "loaf",
        defaultPrice: 25,
      },
      {
        name: "Bread slice",
        description: "1 bread has 12 slices",
        qty: 1,
        unitCode: "slice",
        defaultPrice: 2.08,
      },
    ],
  },
  {
    code: "tea",
    products: [
      {
        name: "Teabag",
        description: "3×100 teabags = 549.08 → 1.83 each",
        qty: 1,
        unitCode: "teabag",
        defaultPrice: 1.83,
      },
      {
        name: "Tea box (20)",
        description: "1 box has 20 bags",
        qty: 1,
        unitCode: "box",
        defaultPrice: 36.6,
      },
      {
        name: "Tea pack (100)",
        description: "From expense — 100 teabags pack",
        qty: 100,
        unitCode: "teabag",
        defaultPrice: 183.03,
      },
    ],
  },
];

export function findGroceryHint(opts: {
  code: string | null;
  name: string;
}): GroceryProductHint | null {
  const code = opts.code?.toLowerCase() ?? null;
  const name = opts.name.toLowerCase();
  return (
    GROCERY_PRODUCT_HINTS.find(
      (h) =>
        (h.code && code && h.code.toLowerCase() === code) ||
        (h.name && h.name.toLowerCase() === name),
    ) ?? null
  );
}
