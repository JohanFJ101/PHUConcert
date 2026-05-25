/**
 * Demo data seed for PHUConcert.
 *
 * Triggered by `npm run prisma:seed`. The script is intentionally
 * destructive: it wipes every operational table and reinserts a known
 * set of fixtures so local development always starts from the same state.
 *
 * What gets created:
 *   * Three operator accounts (`food_staff`, `bar_staff`, `admin`) all
 *     sharing the password `password123`.
 *   * Two shops (Food Counter and Bar Counter) with their menus.
 *   * Ten fully-registered mock attendees with name/DOB/email/phone, each
 *     linked to one active wristband with a random initial balance. Use
 *     these tokens (look at the seed output) to test the scanner login
 *     flow end-to-end without having to register first.
 *
 * To test the first-scan registration flow, generate blank wristbands
 * from the admin dashboard instead.
 */

const { randomInt } = require("crypto");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

// Deterministic-ish mock attendees so the seed reads the same way each
// time and so the staff/admin UI has interesting data to display.
const MOCK_ATTENDEES = [
  { name: "Aarav Sharma", dob: "1995-04-12", email: "aarav.sharma@example.com", phone: "+919812345001" },
  { name: "Priya Iyer", dob: "1992-09-03", email: "priya.iyer@example.com", phone: "+919812345002" },
  { name: "Rohan Mehta", dob: "1998-12-21", email: "rohan.mehta@example.com", phone: "+919812345003" },
  { name: "Ananya Reddy", dob: "2000-07-15", email: "ananya.reddy@example.com", phone: "+919812345004" },
  { name: "Vikram Kapoor", dob: "1988-01-30", email: "vikram.kapoor@example.com", phone: "+919812345005" },
  { name: "Sneha Banerjee", dob: "1996-06-08", email: "sneha.banerjee@example.com", phone: "+919812345006" },
  { name: "Karan Nair", dob: "1990-11-19", email: "karan.nair@example.com", phone: "+919812345007" },
  { name: "Meera Pillai", dob: "2002-03-25", email: "meera.pillai@example.com", phone: "+919812345008" },
  { name: "Arjun Desai", dob: "1985-08-14", email: "arjun.desai@example.com", phone: "+919812345009" },
  { name: "Isha Joshi", dob: "1999-02-27", email: "isha.joshi@example.com", phone: "+919812345010" }
];

// Stable 8-digit tokens for the seeded attendees. Easy to type into the
// manual-entry fallback during testing.
const MOCK_TOKENS = [
  "10000001",
  "10000002",
  "10000003",
  "10000004",
  "10000005",
  "10000006",
  "10000007",
  "10000008",
  "10000009",
  "10000010"
];

async function main() {
  // Wipe in dependency order: transactions reference everything else, and
  // items/staff/wristbands reference shops/users, so children go first.
  await prisma.transaction.deleteMany();
  await prisma.item.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.wristband.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.user.deleteMany();

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
  // fast and the local credentials memorable.
  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.staff.createMany({
    data: [
      { username: "food_staff", passwordHash, role: "STAFF", shopId: foodShop.id },
      { username: "bar_staff", passwordHash, role: "STAFF", shopId: barShop.id },
      { username: "admin", passwordHash, role: "ADMIN" }
    ]
  });

  // Ten fully-registered mock attendees: each has a wristband with a
  // random pretest balance so charging and topping up are immediately
  // exercisable from the staff and attendee UIs.
  for (let i = 0; i < MOCK_ATTENDEES.length; i += 1) {
    const profile = MOCK_ATTENDEES[i];
    const token = MOCK_TOKENS[i];
    const balance = randomInt(200, 1500);

    const user = await prisma.user.create({
      data: {
        ticketId: token,
        email: profile.email,
        name: profile.name,
        dob: new Date(profile.dob + "T00:00:00.000Z"),
        phone: profile.phone
      }
    });

    await prisma.wristband.create({
      data: {
        qrToken: token,
        userId: user.id,
        balanceCredits: balance,
        status: "ACTIVE"
      }
    });
  }

  console.log("Seeded PHUConcert demo data.");
  console.log("Seeded wristband tokens (for manual-entry testing):");
  for (let i = 0; i < MOCK_ATTENDEES.length; i += 1) {
    console.log(`  ${MOCK_TOKENS[i]}  -  ${MOCK_ATTENDEES[i].name}`);
  }
  console.log("Staff/admin credentials: food_staff / bar_staff / admin, password 'password123'.");
  console.log("Generate blank wristbands from the admin dashboard to test the first-scan registration flow.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
