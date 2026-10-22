#!/usr/bin/env bash
# ==============================================================================
# TeleThread Linux tc netem Network Emulation Benchmark Harness
# Simulates Western Ghats Rural Cellular Degradation & Power Outages
# ==============================================================================

set -e

# Default network interface (can be overridden as 2nd argument, e.g. ./run_netem_profiles.sh 3g wlan0)
IFACE="${2:-eth0}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function check_root() {
  if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}[ERROR] Please run as root or with sudo to modify kernel tc qdisc.${NC}"
    echo "Usage: sudo $0 <profile> [interface]"
    exit 1
  fi
}

function check_tc() {
  if ! command -v tc &> /dev/null; then
    echo -e "${RED}[ERROR] Linux traffic control (tc) command not found.${NC}"
    echo "Install iproute2: apt-get install -y iproute2"
    exit 1
  fi
}

function profile_reset() {
  echo -e "${BLUE}=== [TeleThread] Resetting tc qdisc on interface ${IFACE} ===${NC}"
  tc qdisc del dev "${IFACE}" root 2>/dev/null || true
  echo -e "${GREEN}[OK] Interface ${IFACE} reset to unthrottled baseline.${NC}"
}

# Profile 1: 3G-like Link (350kbit, 120ms RTT, 20ms jitter, 2% loss)
function profile_3g() {
  profile_reset
  echo -e "${YELLOW}=== [TeleThread Profile 1: 3G-like Rural Highway Link] ===${NC}"
  echo "Rate: 350 kbit/s | Delay: 120ms ± 20ms | Loss: 2%"
  tc qdisc add dev "${IFACE}" root handle 1: netem delay 120ms 20ms loss 2%
  tc qdisc add dev "${IFACE}" parent 1: handle 10: tbf rate 350kbit buffer 1600 limit 3000
  echo -e "${GREEN}[ACTIVE] Expect TeleThread Tier 2 (Low-Res Video, 140 kbps cap).${NC}"
}

# Profile 2: 2G-like Link (45kbit, 350ms RTT, 40ms jitter, 4% loss)
function profile_2g() {
  profile_reset
  echo -e "${YELLOW}=== [TeleThread Profile 2: 2G-like Hill Valley Edge Link] ===${NC}"
  echo "Rate: 45 kbit/s | Delay: 350ms ± 40ms | Loss: 4%"
  tc qdisc add dev "${IFACE}" root handle 1: netem delay 350ms 40ms loss 4%
  tc qdisc add dev "${IFACE}" parent 1: handle 10: tbf rate 45kbit buffer 1600 limit 3000
  echo -e "${GREEN}[ACTIVE] Expect TeleThread Tier 3 (Audio-Only Opus + Still Photos).${NC}"
}

# Profile 3: Lossy Link (180kbit, 8% packet loss, 80ms delay)
function profile_3g_lossy() {
  profile_reset
  echo -e "${YELLOW}=== [TeleThread Profile 3: Heavy Packet Loss (Rain Fade)] ===${NC}"
  echo "Rate: 180 kbit/s | Delay: 80ms | Loss: 8%"
  tc qdisc add dev "${IFACE}" root handle 1: netem delay 80ms loss 8%
  tc qdisc add dev "${IFACE}" parent 1: handle 10: tbf rate 180kbit buffer 1600 limit 3000
  echo -e "${GREEN}[ACTIVE] Expect TeleThread Tier 2 / Tier 3 transition with Hysteresis stability.${NC}"
}

# Profile 4: Flapping Ghat Link (Alternating 350kbit and 25kbit every 10s)
function profile_flapping() {
  profile_reset
  echo -e "${YELLOW}=== [TeleThread Profile 4: Flapping Ghat Shadow Link] ===${NC}"
  echo "Simulating periodic hairpin turns with 350kbit (Good) <-> 25kbit (Shadow) every 10s"
  echo "Press [Ctrl+C] to stop simulation."

  trap 'profile_reset; exit 0' INT TERM

  while true; do
    echo -e "\n${BLUE}>>> Switching to 350 kbps (Clear line of sight)...${NC}"
    tc qdisc del dev "${IFACE}" root 2>/dev/null || true
    tc qdisc add dev "${IFACE}" root handle 1: netem delay 100ms
    tc qdisc add dev "${IFACE}" parent 1: handle 10: tbf rate 350kbit buffer 1600 limit 3000
    sleep 10

    echo -e "\n${RED}>>> Dropping to 25 kbps (Ghat gorge shadow / Tunnel)...${NC}"
    tc qdisc del dev "${IFACE}" root 2>/dev/null || true
    tc qdisc add dev "${IFACE}" root handle 1: netem delay 400ms loss 5%
    tc qdisc add dev "${IFACE}" parent 1: handle 10: tbf rate 25kbit buffer 1600 limit 3000
    sleep 10
  done
}

# Profile 5: Complete 60-Second Outage (100% loss, then auto-restore)
function profile_outage_60s() {
  profile_reset
  echo -e "${RED}=== [TeleThread Profile 5: Complete 60s Ghat Tower Blackout] ===${NC}"
  echo "Simulating 100% packet loss for 60 seconds (Tier 4 Store-and-Forward activation)..."
  tc qdisc add dev "${IFACE}" root netem loss 100%

  for i in $(seq 60 -1 1); do
    echo -ne "Outage active: ${i}s remaining (IndexedDB caching enabled)... \r"
    sleep 1
  done

  echo -e "\n${GREEN}=== [Network Restored] Resetting to Tier 1 unthrottled link ===${NC}"
  profile_reset
  echo -e "${GREEN}[VERIFIED] TeleThread should now auto-flush the offline IndexedDB outbox on the exact same Case ID!${NC}"
}

function show_menu() {
  echo -e "${BLUE}======================================================${NC}"
  echo -e "${GREEN}    TeleThread tc netem Network Emulation Harness    ${NC}"
  echo -e "${BLUE}======================================================${NC}"
  echo "Target Interface: ${IFACE}"
  echo ""
  echo "Available profiles:"
  echo "  1) 3g        - Profile 1: 350 kbps, 120ms RTT, 2% loss"
  echo "  2) 2g        - Profile 2: 45 kbps, 350ms RTT, 4% loss"
  echo "  3) lossy     - Profile 3: 180 kbps, 80ms RTT, 8% loss"
  echo "  4) flapping  - Profile 4: Flapping (350 kbps <-> 25 kbps every 10s)"
  echo "  5) outage    - Profile 5: 60-second complete blackout (100% loss)"
  echo "  6) reset     - Clean/Remove all emulation rules"
  echo ""
  echo "Usage: sudo $0 <3g|2g|lossy|flapping|outage|reset> [interface]"
}

# Main dispatcher
check_root
check_tc

case "$1" in
  3g)
    profile_3g
    ;;
  2g)
    profile_2g
    ;;
  lossy)
    profile_3g_lossy
    ;;
  flapping)
    profile_flapping
    ;;
  outage)
    profile_outage_60s
    ;;
  reset)
    profile_reset
    ;;
  *)
    show_menu
    exit 1
    ;;
esac
