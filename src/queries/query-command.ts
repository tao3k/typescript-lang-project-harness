import path from "node:path";

import type { QueryArgs } from "../cli/protocol.js";
import {
  buildOwnerItemSemanticQueryPacket,
  renderOwnerItemQuery,
  renderOwnerItemSemanticQueryPacketJson,
} from "../cli/semantic-search/item-query.js";
import {
  buildOwnerItemSemanticReadPacket,
  renderOwnerExactSourceWindowCode,
  renderOwnerItemQueryCode,
  renderOwnerItemSemanticReadPacket,
  renderOwnerItemSemanticReadPacketJson,
} from "../cli/semantic-search/item-read.js";
import { selectorHasLineRange } from "./source-selector.js";

interface QueryCommandStreams {
  readonly stdout: { write(chunk: string): unknown };
}

export function runTypeScriptQueryCommand(
  args: QueryArgs,
  streams: QueryCommandStreams,
  cwd: string,
): number {
  let projectRoot = path.resolve(cwd, args.projectRoot ?? ".");
  if (args.packagePath !== undefined && !args.workspace) {
    projectRoot = path.resolve(projectRoot, args.packagePath);
  }
  const itemQuery = args.terms.join("|");
  if (args.json) {
    streams.stdout.write(
      args.renderMode === "read-packet"
        ? renderOwnerItemSemanticReadPacketJson(
            buildOwnerItemSemanticReadPacket(
              projectRoot,
              args.ownerPath,
              itemQuery,
              args.selector ?? args.ownerPath,
            ),
          )
        : renderOwnerItemSemanticQueryPacketJson(
            buildOwnerItemSemanticQueryPacket(
              projectRoot,
              args.ownerPath,
              itemQuery,
              args.namesOnly ? "names" : "code",
            ),
          ),
    );
  } else if (args.codeOnly) {
    streams.stdout.write(
      `${
        selectorHasLineRange(args.selector, args.ownerPath)
          ? renderOwnerExactSourceWindowCode(
              projectRoot,
              args.ownerPath,
              args.selector ?? args.ownerPath,
            )
          : renderOwnerItemQueryCode(projectRoot, args.ownerPath, itemQuery, args.selector)
      }\n`,
    );
  } else if (selectorHasLineRange(args.selector, args.ownerPath)) {
    streams.stdout.write(
      `${renderOwnerItemSemanticReadPacket(
        buildOwnerItemSemanticReadPacket(
          projectRoot,
          args.ownerPath,
          itemQuery,
          args.selector ?? args.ownerPath,
        ),
      )}\n`,
    );
  } else {
    const itemQueryOptions = args.namesOnly === undefined ? {} : { namesOnly: args.namesOnly };
    streams.stdout.write(
      `${renderOwnerItemQuery(projectRoot, args.ownerPath, itemQuery, itemQueryOptions)}\n`,
    );
  }
  return 0;
}
