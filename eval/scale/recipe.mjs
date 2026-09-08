/** Deterministic acceptance corpus; no runtime network, clock, or random input. */
export function scaleRequest(count) {
  if (![25, 100, 250].includes(count)) throw new RangeError('Supported scale recipes are 25, 100, and 250.');
  const perProcess = count / 5;
  const processes = [];
  const participants = [];
  const endpoints = [];
  for (let p = 0; p < 5; p++) {
    const key = `process-${p}`;
    const nodes = [];
    for (let n = 0; n < perProcess; n++) {
      const nested = count === 250 && p === 0 && n >= 1 && n <= 4;
      const containerRef = count === 250 && p === 0 && n >= 2 && n <= 5 ? `node-${p}-${n - 1}` : key;
      const type = n === 0 ? 'startEvent' : n === perProcess - 1 ? 'endEvent' : nested ? 'subProcess' : 'task';
      const name = n === 6 ? `Check evidence ${p} ` + 'and retain the documented operational decision for independent process review'.padEnd(103, '.') : `${type === 'task' ? 'Review item' : type === 'subProcess' ? 'Review detail' : n === 0 ? 'Request received' : 'Request completed'} ${p}.${n}`;
      nodes.push({ key: `node-${p}-${n}`, type, containerRef, name, ...(['startEvent', 'endEvent'].includes(type) ? { event: { kind: 'none' } } : {}) });
    }
    const root = nodes.filter(node => node.containerRef === key);
    const flows = root.slice(1).map((node, index) => ({ key: `sequence-${p}-${index}`, containerRef: key, sourceRef: root[index].key, targetRef: node.key }));
    const midpoint = Math.ceil(root.length / 2);
    const lanes = [root.slice(0, midpoint), root.slice(midpoint)].map((members, index) => ({ key: `lane-${p}-${index}`, parentRef: key, name: index ? 'Operations review' : 'Intake and evidence', flowNodeRefs: members.map(node => node.key) }));
    processes.push({ key, name: `Operational process ${p + 1}`, nodes, flows, lanes });
    participants.push({ key: `participant-${p}`, name: `Business participant ${p + 1}`, processRef: key });
    endpoints.push(nodes.filter(node => node.type === 'task' && node.containerRef === key).map(node => node.key));
  }
  const sequenceCount = processes.reduce((sum, process) => sum + process.flows.length, 0);
  const messageFlows = [];
  for (let i = 0; i < count * 2 - sequenceCount; i++) {
    const source = i % 5;
    const round = Math.floor(i / 5);
    const target = (source + 1 + Math.floor(round / endpoints[source].length) % 4) % 5;
    messageFlows.push({ key: `message-${i}`, name: `Evidence handoff ${i + 1}`, sourceRef: endpoints[source][round % endpoints[source].length], targetRef: endpoints[target][(round * 7 + 1) % endpoints[target].length] });
  }
  return {
    schemaVersion: '1.0.0', profileVersion: '1.0.0',
    model: { key: `scale-${count}`, name: `${count}-node deterministic qualification`, primaryRef: 'collaboration', processes, collaboration: { key: 'collaboration', name: 'Operational evidence coordination', participants, messageFlows } },
    presentation: { direction: 'leftToRight' },
  };
}
