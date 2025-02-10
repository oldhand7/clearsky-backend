/*
  Warnings:

  - You are about to drop the column `date` on the `Train` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Train" DROP COLUMN "date",
ADD COLUMN     "data" TEXT NOT NULL DEFAULT 'default_data';
