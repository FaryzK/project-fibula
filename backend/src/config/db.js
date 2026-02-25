const knex = require('knex');
const { createClient } = require('@supabase/supabase-js');
const knexConfig = require('../../knexfile');
const env = require('./env');

const db = knex(knexConfig[env.nodeEnv] || knexConfig.development);

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

module.exports = { db, supabase };
