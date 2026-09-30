CREATE TABLE "auth_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"login_id" varchar(30) NOT NULL,
	"event" varchar(16) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_events_event_valid" CHECK ("auth_events"."event" in ('SIGNUP', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT')),
	CONSTRAINT "auth_events_platform_valid" CHECK ("auth_events"."platform" in ('ios', 'web'))
);
--> statement-breakpoint
CREATE TABLE "coin_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(12) NOT NULL,
	"amount" integer NOT NULL,
	"reference_key" varchar(40) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coin_transactions_once_per_reference" UNIQUE("user_id","type","reference_key"),
	CONSTRAINT "coin_transactions_amount_sign" CHECK (("coin_transactions"."type" = 'ATTENDANCE' and "coin_transactions"."amount" > 0) or ("coin_transactions"."type" = 'PURCHASE' and "coin_transactions"."amount" < 0))
);
--> statement-breakpoint
CREATE TABLE "diaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"diary_date" date NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diaries_user_date_unique" UNIQUE("user_id","diary_date"),
	CONSTRAINT "diaries_body_length" CHECK (char_length(btrim("diaries"."body")) between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "monthly_records" (
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"plant_id" varchar(40),
	"selection_locked" boolean DEFAULT false NOT NULL,
	"total_days" smallint NOT NULL,
	"written_days" smallint DEFAULT 0 NOT NULL,
	"growth_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"growth_stage" smallint DEFAULT 1 NOT NULL,
	"finalized" boolean DEFAULT false NOT NULL,
	"finalized_at" timestamp with time zone,
	"unlocked_plant_id" varchar(40),
	CONSTRAINT "monthly_records_user_id_month_pk" PRIMARY KEY("user_id","month"),
	CONSTRAINT "monthly_records_month_first_day" CHECK (extract(day from "monthly_records"."month") = 1),
	CONSTRAINT "monthly_records_total_days_range" CHECK ("monthly_records"."total_days" between 28 and 31),
	CONSTRAINT "monthly_records_written_days_range" CHECK ("monthly_records"."written_days" between 0 and "monthly_records"."total_days"),
	CONSTRAINT "monthly_records_growth_percent_range" CHECK ("monthly_records"."growth_percent" between 0 and 100),
	CONSTRAINT "monthly_records_growth_stage_range" CHECK ("monthly_records"."growth_stage" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "plants" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"name" varchar(40) NOT NULL,
	"description" text NOT NULL,
	"kind" varchar(8) NOT NULL,
	"catalog_class" varchar(10) NOT NULL,
	"initial_free" boolean NOT NULL,
	"coin_price" integer,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "plants_kind_valid" CHECK ("plants"."kind" in ('PLANT', 'FLOWER')),
	CONSTRAINT "plants_class_valid" CHECK ("plants"."catalog_class" in ('STANDARD', 'LIMITED', 'SPECIAL')),
	CONSTRAINT "plants_price_matches_class" CHECK (("plants"."catalog_class" = 'STANDARD' and "plants"."coin_price" is null) or ("plants"."catalog_class" <> 'STANDARD' and "plants"."coin_price" is not null and "plants"."coin_price" > 0)),
	CONSTRAINT "plants_initial_is_standard" CHECK (not "plants"."initial_free" or "plants"."catalog_class" = 'STANDARD')
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" char(64) NOT NULL,
	"platform" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "sessions_platform_valid" CHECK ("sessions"."platform" in ('ios', 'web'))
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_plants" (
	"user_id" uuid NOT NULL,
	"plant_id" varchar(40) NOT NULL,
	"unlock_source" varchar(12) NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_plants_user_id_plant_id_pk" PRIMARY KEY("user_id","plant_id"),
	CONSTRAINT "user_plants_source_valid" CHECK ("user_plants"."unlock_source" in ('INITIAL', 'ACHIEVEMENT', 'SHOP'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"login_id" varchar(30) NOT NULL,
	"nickname" varchar(30) NOT NULL,
	"coin_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_id_unique" UNIQUE("login_id"),
	CONSTRAINT "users_coin_balance_nonnegative" CHECK ("users"."coin_balance" >= 0),
	CONSTRAINT "users_login_id_format" CHECK ("users"."login_id" ~ '^[a-z0-9_]{3,30}$'),
	CONSTRAINT "users_nickname_not_blank" CHECK (char_length(btrim("users"."nickname")) >= 1)
);
--> statement-breakpoint
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coin_transactions" ADD CONSTRAINT "coin_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_records" ADD CONSTRAINT "monthly_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_records" ADD CONSTRAINT "monthly_records_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_records" ADD CONSTRAINT "monthly_records_unlocked_plant_id_plants_id_fk" FOREIGN KEY ("unlocked_plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credentials" ADD CONSTRAINT "user_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_plants" ADD CONSTRAINT "user_plants_plant_id_plants_id_fk" FOREIGN KEY ("plant_id") REFERENCES "public"."plants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_events_user_id_idx" ON "auth_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");