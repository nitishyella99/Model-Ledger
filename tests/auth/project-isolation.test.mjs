import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("ownership migration safely reruns with an existing owner column and isolates project records", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.jwt() returns jsonb language sql stable as
        $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant usage on schema public, auth to anon, authenticated;
    `);
    let existingProject;
    for (const name of (await readdir("supabase/migrations")).filter(n => n.endsWith(".sql")).sort()) {
      // PGlite provides gen_random_uuid() natively, without the optional pgcrypto extension.
      const sql = (await readFile(`supabase/migrations/${name}`, "utf8"))
        .replace("create extension if not exists pgcrypto;", "");
      if (name === "20261002090000_clerk_project_ownership.sql") {
        await db.exec("alter table public.models add column owner_user_id text");
        existingProject = (await db.query("insert into public.models(name, provider, purpose, owner_user_id) values ('Existing', 'test', 'preserve ownership', 'user_existing') returning id")).rows[0].id;
        await db.exec(sql);
        await db.exec(sql);
        assert.equal((await db.query("select owner_user_id from public.models where id = $1", [existingProject])).rows[0].owner_user_id, "user_existing");
      } else {
        await db.exec(sql);
      }
    }
    const query = (sql, params = []) => db.query(sql, params);
    const login = async (user) => {
      await db.exec("reset role");
      await query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(user ? { sub: user, role: "authenticated" } : {})]);
      await db.exec(`set role ${user ? "authenticated" : "anon"}`);
    };
    const insert = async (table, data) => {
      const keys = Object.keys(data);
      const { rows } = await query(`insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => `$${i+1}`).join(",")}) returning *`, Object.values(data));
      return rows[0];
    };
    const legacy = await insert("models", { name: "Legacy", provider: "test", purpose: "unassigned" });
    assert.equal(legacy.owner_user_id, null);
    await login("user_a");
    const a = await insert("models", { name: "A", provider: "test", purpose: "private" });
    assert.equal(a.owner_user_id, "user_a");
    const av = await insert("model_versions", { model_id: a.id, version: "v1" });
    const at = await insert("test_cases", { model_id: a.id, model_version_id: av.id, stable_key: "one", name: "Test", category: "test", input: "input", expected_output: "output" });
    const ae = await insert("evaluations", { model_id: a.id, model_version_id: av.id, name: "Run", evaluated_at: new Date().toISOString() });
    await insert("version_changes", { model_version_id: av.id, change_type: "OTHER", description: "Change" });
    await insert("model_version_configurations", { model_version_id: av.id, provider: "test", model_name: "test", credential_reference: "SERVER_KEY" });
    await insert("evaluation_results", { evaluation_id: ae.id, test_case_id: at.id, test_name: "Test", category: "test", test_input: "input", expected_result: "output", actual_result: "output", result: "PASS", severity: "LOW" });
    await insert("evaluation_recommendations", { evaluation_id: ae.id, priority: "HIGH", title: "Fix", action: "Fix" });
    await query("update models set current_model_version_id = $1 where id = $2", [av.id, a.id]);
    await query("update evaluations set status = 'RUNNING' where id = $1", [ae.id]);
    const tables = ["models", "model_versions", "version_changes", "model_version_configurations", "test_cases", "evaluations", "evaluation_results", "evaluation_recommendations"];
    for (const table of tables) assert.equal((await query(`select * from ${table}`)).rows.length, 1, `A sees ${table}`);
    await assert.rejects(query("update models set owner_user_id = 'user_b' where id = $1", [a.id]));
    await assert.rejects(insert("models", { name: "Spoof", provider: "test", purpose: "test", owner_user_id: "user_b" }));
    await login("user_b");
    for (const table of tables) assert.equal((await query(`select * from ${table}`)).rows.length, 0, `B cannot see ${table}`);
    assert.equal((await query("update models set name = 'hacked' where id = $1 returning *", [a.id])).rows.length, 0);
    assert.equal((await query("delete from model_versions where id = $1 returning *", [av.id])).rows.length, 0);
    await assert.rejects(insert("model_versions", { model_id: a.id, version: "hacked" }));
    await assert.rejects(insert("version_changes", { model_version_id: av.id, change_type: "OTHER", description: "hacked" }));
    await assert.rejects(insert("model_version_configurations", { model_version_id: av.id, provider: "test", model_name: "test", credential_reference: "key" }));
    await assert.rejects(insert("evaluation_recommendations", { evaluation_id: ae.id, priority: "HIGH", title: "hacked", action: "hacked" }));
    const b = await insert("models", { name: "B", provider: "test", purpose: "private" });
    const bv = await insert("model_versions", { model_id: b.id, version: "v1" });
    const be = await insert("evaluations", { model_id: b.id, model_version_id: bv.id, name: "Run", evaluated_at: new Date().toISOString() });
    await assert.rejects(query("update models set current_model_version_id = $1 where id = $2", [av.id, b.id]));
    await assert.rejects(insert("test_cases", { model_id: b.id, model_version_id: av.id, stable_key: "attack", name: "Test", category: "test", input: "input", expected_output: "output" }));
    await assert.rejects(insert("evaluations", { model_id: b.id, model_version_id: av.id, name: "hacked", evaluated_at: new Date().toISOString() }));
    await assert.rejects(insert("evaluation_results", { evaluation_id: be.id, test_case_id: at.id, test_name: "hacked", category: "test", test_input: "input", expected_result: "output", actual_result: "output", result: "PASS", severity: "LOW" }));
    // Reject inconsistent links even between two projects belonging to one user.
    const b2 = await insert("models", { name: "B2", provider: "test", purpose: "private" });
    await assert.rejects(query("update models set current_model_version_id = $1 where id = $2", [bv.id, b2.id]));
    await login(null);
    for (const table of tables) await assert.rejects(query(`select * from ${table}`), `Anonymous access denied: ${table}`);
    await assert.rejects(insert("models", { name: "Anonymous", provider: "test", purpose: "test" }));
    await login("user_a");
    assert.equal((await query("select * from models")).rows.length, 1);
    await db.exec("reset role");
    assert.equal((await query("select owner_user_id from models where id = $1", [legacy.id])).rows[0].owner_user_id, null);
    assert.equal((await query("select * from pg_policies where policyname like 'demo_%'")).rows.length, 0);
  } finally {
    await db.close();
  }
});
