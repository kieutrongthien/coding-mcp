import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NotFoundError } from "../../src/core/errors.js";
import { JsonRegistryStore } from "../../src/services/project-registry/registry-store-json.js";
import { ProjectRegistryService } from "../../src/services/project-registry/project-registry.service.js";
import { ProjectScanner } from "../../src/services/project-registry/project-scanner.js";

describe("ProjectRegistryService roots", () => {
  it("init/add/remove roots and refresh projects", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "registry-service-"));
    const rootA = path.join(work, "root-a");
    const rootB = path.join(work, "root-b");

    fs.mkdirSync(path.join(rootA, "proj1"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "proj2"), { recursive: true });

    const registryPath = path.join(work, "registry.json");
    const store = new JsonRegistryStore(registryPath);
    const scanner = new ProjectScanner([]);
    const service = new ProjectRegistryService(scanner, store);

    const init = service.initFromRoot(rootA);
    expect(init.roots).toEqual([path.resolve(rootA)]);
    expect(init.projects.length).toBe(1);

    const add = service.addRoot(rootB);
    expect(add.roots).toEqual([path.resolve(rootA), path.resolve(rootB)]);
    expect(add.projects.length).toBe(2);

    const remove = service.removeRoot(rootA);
    expect(remove.roots).toEqual([path.resolve(rootB)]);
    expect(remove.projects.length).toBe(1);
  });

  it("does not merge scanner roots when persisted roots already exist", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "registry-service-"));
    const rootA = path.join(work, "root-a");
    const rootB = path.join(work, "root-b");

    fs.mkdirSync(path.join(rootA, "proj1"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "proj2"), { recursive: true });

    const registryPath = path.join(work, "registry.json");
    const store = new JsonRegistryStore(registryPath);
    store.save([rootA], []);

    const scanner = new ProjectScanner([rootB]);
    const service = new ProjectRegistryService(scanner, store);

    expect(service.listRoots()).toEqual([path.resolve(rootA)]);
  });

  it("throws when removing a root that is not in registry", () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "registry-service-"));
    const rootA = path.join(work, "root-a");
    const rootMissing = path.join(work, "root-missing");

    fs.mkdirSync(path.join(rootA, "proj1"), { recursive: true });

    const registryPath = path.join(work, "registry.json");
    const store = new JsonRegistryStore(registryPath);
    const scanner = new ProjectScanner([rootA]);
    const service = new ProjectRegistryService(scanner, store);
    service.initFromRoot(rootA);

    expect(() => service.removeRoot(rootMissing)).toThrowError(NotFoundError);
  });

  it("syncs changes from other process without restart", async () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "registry-service-"));
    const rootA = path.join(work, "root-a");
    const rootB = path.join(work, "root-b");

    fs.mkdirSync(path.join(rootA, "proj1"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "proj2"), { recursive: true });

    const registryPath = path.join(work, "registry.json");
    const storeA = new JsonRegistryStore(registryPath);
    const scannerA = new ProjectScanner([]);
    const serviceA = new ProjectRegistryService(scannerA, storeA);
    serviceA.initFromRoot(rootA);
    expect(serviceA.listProjects().length).toBe(1);

    const storeB = new JsonRegistryStore(registryPath);
    const scannerB = new ProjectScanner([]);
    const serviceB = new ProjectRegistryService(scannerB, storeB);
    serviceB.addRoot(rootB);

    await new Promise((resolve) => setTimeout(resolve, 5));

    const syncedRoots = serviceA.listRoots();
    expect(syncedRoots).toEqual([path.resolve(rootA), path.resolve(rootB)]);
    expect(serviceA.listProjects().length).toBe(2);
  });
});
