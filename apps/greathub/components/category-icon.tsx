import {
  Armchair,
  Backpack,
  BatteryCharging,
  Cable,
  Cake,
  Cookie,
  CupSoda,
  Droplets,
  Footprints,
  Gem,
  Lamp,
  type LucideIcon,
  Luggage,
  Mic,
  Monitor,
  Package,
  PartyPopper,
  Plug,
  Shirt,
  Table2,
  Usb,
  UtensilsCrossed,
  Webcam,
  Wheat,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  desks: Table2,
  chairs: Armchair,
  monitors: Monitor,
  cables: Cable,
  webcams: Webcam,
  docks: Usb,
  audio: Mic,
  lighting: Lamp,
  dresses: Shirt,
  knitwear: Shirt,
  shirts: Shirt,
  skirts: Shirt,
  suits: Shirt,
  shoes: Footprints,
  luggage: Luggage,
  power: BatteryCharging,
  toiletries: Droplets,
  organization: Backpack,
  cakes: Cake,
  snacks: Cookie,
  drinks: CupSoda,
  tableware: UtensilsCrossed,
  decorations: PartyPopper,
  bakery: Wheat,
};

export function CategoryIcon({
  category,
  department,
  size = 88,
}: {
  category: string;
  department: string;
  size?: number;
}) {
  const Icon =
    ICONS[category] ??
    (department === "apparel"
      ? Gem
      : department === "travel"
        ? Plug
        : department === "party"
          ? PartyPopper
          : Package);
  return <Icon size={size} strokeWidth={1} aria-hidden="true" />;
}
