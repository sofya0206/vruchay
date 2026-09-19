-- Счётчики обучения по дням — без организации и без человека.
CREATE TABLE "onboarding_stats" (
    "day" DATE NOT NULL,
    "flow" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "onboarding_stats_pkey" PRIMARY KEY ("day","flow","step","action")
);
