/**
 * Demo data seed for PHUConcert.
 *
 * Triggered by `npm run prisma:seed`, which Prisma wires up through the
 * `prisma.seed` field in package.json. The script is intentionally
 * destructive: it wipes every operational table and reinserts a known set
 * of fixtures so that local development always starts from the same state.
 *
 * What gets created:
 *   * One demo attendee (`demo@example.com`) born 2000-01-01 (over 21 so
 *     they can buy alcohol in the manual test plan).
 *   * One demo wristband `wb_demo_001` with 500 credits.
 *   * A FOOD shop with three menu items and an ALCOHOL shop with two
 *     age-restricted items.
 *   * Three operator accounts (`food_staff`, `bar_staff`, `admin`) all
 *     sharing the password `password123`. Hashing happens with bcrypt at
 *     cost 10 so the seed runs quickly.
 *
 * Order of deletion matters: child tables (transaction, item, wristband)
 * are emptied before their parents to avoid foreign-key violations.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // Wipe in dependency order: transactions reference everything else,
  // items/staff/wristbands reference shops/users, so they go first.
  await prisma.transaction.deleteMany();
  await prisma.item.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.wristband.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.user.deleteMany();

  // Demo attendee. DOB is fixed in the past so the alcohol flow works
  // out-of-the-box; the README's manual test plan asks the tester to edit
  // this DOB to verify the under-21 rejection path.
  const demoUser = await prisma.user.create({
    data: {
      email: "demo@example.com",
      name: "Demo User",
      dob: new Date("2000-01-01T00:00:00.000Z"),
      gender: "Not specified",
      phone: "1234567890"
    }
  });

  // Wristband linked to the demo attendee. The QR token is short and
  // typeable so staff can enter it by hand during testing.
  await prisma.wristband.create({
    data: {
      qrToken: "wb_demo_001",
      userId: demoUser.id,
      balanceCredits: 500,
      status: "ACTIVE"
    }
  });

  // Food shop with three plain items (no age restriction).
  const foodShop = await prisma.shop.create({
    data: {
      name: "Food Counter",
      category: "FOOD",
      items: {
        create: [
          { name: "Burger", priceCredits: 120, category: "FOOD" },
          { name: "Fries", priceCredits: 60, category: "FOOD" },
          { name: "Water", priceCredits: 30, category: "FOOD" }
        ]
      }
    }
  });

  // Bar shop with two age-restricted items so the 21+ rule can be tested.
  const barShop = await prisma.shop.create({
    data: {
      name: "Bar Counter",
      category: "ALCOHOL",
      items: {
        create: [
          { name: "Beer", priceCredits: 150, category: "ALCOHOL", ageRestricted: true },
          { name: "Cocktail", priceCredits: 250, category: "ALCOHOL", ageRestricted: true }
        ]
      }
    }
  });

  // Reusing one hashed password for all demo operators keeps the seed
  // fast and the local credentials memorable. Production must NEVER share
  // hashes like this; this is a fixture for local testing only.
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.staff.createMany({
    data: [
      {
        username: "food_staff",
        passwordHash,
        role: "STAFF",
        shopId: foodShop.id
      },
      {
        username: "bar_staff",
        passwordHash,
        role: "STAFF",
        shopId: barShop.id
      },
      {
        // Admins have no shop attached; the schema allows `shopId` to be
        // null for exactly this case.
        username: "admin",
        passwordHash,
        role: "ADMIN"
      }
    ]
  });

  console.log("Seeded PHUConcert demo data.");
}

main()
  .catch((error) => {
    console.error(error);
    // Exit non-zero so `npm run prisma:seed` fails loudly in CI/scripts.
    process.exit(1);
  })
  .finally(async () => {
    // Always close the connection so the process exits cleanly.
    await prisma.$disconnect();
  });
