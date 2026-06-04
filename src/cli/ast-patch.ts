import {
  invalidTypeScriptAstPatchPacketReceipt,
  typeScriptAstPatchDryRunReceiptFromPacket,
} from "../syntax/ast-patch.js";

export { typeScriptAstPatchDryRunReceiptFromPacket };

export function renderTypeScriptAstPatchDryRunReceiptJson(
  projectRoot: string,
  packetText: string,
): string {
  return `${JSON.stringify(typeScriptAstPatchDryRunReceipt(projectRoot, packetText), null, 2)}\n`;
}

export function typeScriptAstPatchDryRunReceipt(projectRoot: string, packetText: string): unknown {
  let packet: unknown;
  try {
    packet = JSON.parse(packetText) as unknown;
  } catch (error) {
    return invalidTypeScriptAstPatchPacketReceipt(error);
  }
  return typeScriptAstPatchDryRunReceiptFromPacket(projectRoot, packet);
}
