-- Migration 009: Professional services
-- Run this in Supabase SQL Editor

-- Add services JSONB column to professionals table
-- Each service: { id: string, name: string, description?: string, price?: string }
ALTER TABLE professionals
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- RLS: allow professionals to update their own services (covered by existing UPDATE policy from 008)
