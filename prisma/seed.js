const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.item.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.wristband.deleteMany();
  await prisma.shop.deleteMany();
  await prisma.user.deleteMany();

  const demoUser = await prisma.user.create({
    data: {
      email: "demo@example.com",
      name: "Demo User",
      dob: new Date("2000-01-01T00:00:00.000Z"),
      gender: "Not specified",
      phone: "1234567890"
    }
  });

  await prisma.wristband.create({
    data: {
      qrToken: "wb_demo_001",
      userId: demoUser.id,
      balanceCredits: 500,
      status: "ACTIVE"
    }
  });

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
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
