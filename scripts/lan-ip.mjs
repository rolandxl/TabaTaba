import os from 'node:os'

const candidates = []

for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
  for (const address of addresses ?? []) {
    if (address.family !== 'IPv4' || address.internal) continue
    if (address.address.startsWith('169.254.')) continue
    candidates.push({ name, address: address.address })
  }
}

const virtualPattern = /(vEthernet|VPN|Radmin|Tailscale|ZeroTier|Loopback|Virtual|Hyper-V|VMware|VirtualBox)/i
const physicalPattern = /(Wi-?Fi|WLAN|Ethernet|Беспроводная|Сеть)/i

const preferred =
  candidates.find(
    (candidate) =>
      physicalPattern.test(candidate.name) && !virtualPattern.test(candidate.name),
  ) ??
  candidates.find((candidate) => !virtualPattern.test(candidate.name)) ??
  candidates[0]

if (preferred) {
  console.log(preferred.address)
}
