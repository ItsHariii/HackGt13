-- DemoMart catalog and Explore kits. Fictional brands only (SDD §16).
-- Flagship items and prices match the canonical demo dataset (SDD §16.1) exactly:
--   Birchline Compact Desk 46.5" $229 · Kestrel Mesh Task Chair $189 · Vireo U2727 $329
--   Loop USB-C Cable 100 W $19 · Pica 1080p Webcam $49  => $815.00 + $24.00 shipping + $57.05 tax = $896.05
--   Halden M27Q-USBC $309 (the replacement monitor)     => $791.00 + $24.00 + $55.37 = $870.37
--
-- GTINs are GTIN-14 under a fictional company prefix, with valid GS1 check digits.

-- Sellers and policies --------------------------------------------------------------------------
insert into demomart.sellers (id, name) values
  ('dm_seller_1', 'DemoMart'),
  ('dm_seller_2', 'Northwind Outlet (marketplace seller)');

insert into demomart.policies (id, kind, name, terms) values
  ('ret_30_free', 'return', '30-day free returns', '{"returnable": true, "windowDays": 30, "feeMinor": 0, "finalSale": false}'),
  ('ret_30_fee', 'return', '30-day returns, $7.95 fee', '{"returnable": true, "windowDays": 30, "feeMinor": 795, "finalSale": false}'),
  ('ret_14_free', 'return', '14-day free returns', '{"returnable": true, "windowDays": 14, "feeMinor": 0, "finalSale": false}'),
  ('final_sale', 'return', 'Final sale, no returns', '{"returnable": false, "windowDays": 0, "feeMinor": 0, "finalSale": true}'),
  ('ship_standard', 'shipping', 'Standard shipping', '{"label": "Standard (1–5 days)", "flatMinor": 2400}'),
  ('tax_default', 'tax', 'Estimated sales tax', '{"label": "Estimated tax (7%)", "rateBps": 700}');

-- One row per sellable variant. spec: "Name: value" pairs separated by " | ".
create temp table seed_catalog (
  n integer primary key,
  slug text not null,
  brand text not null,
  product_name text not null,
  department text not null,
  category text not null,
  roles text[] not null,
  description text not null,
  sku text not null,
  mpn text not null,
  option_label text,
  price_minor bigint not null,
  delivery_min integer not null,
  delivery_max integer not null,
  return_policy text not null,
  stock integer not null,
  spec text not null
);

insert into seed_catalog values
-- Home office ---------------------------------------------------------------------------------
(1, 'halden-m27q-usbc', 'Halden', 'Halden M27Q-USBC 27" 4K USB-C Monitor', 'home_office', 'monitors', '{monitor}',
 'A 27-inch 4K IPS monitor with single-cable USB-C charging for laptops.', 'M27Q-USBC', 'M27Q-USBC-US', null,
 30900, 1, 2, 'ret_30_free', 18,
 'Screen size: 27 in | Resolution: 3840 × 2160 (4K UHD) | Panel: IPS | Refresh rate: 60 Hz | USB-C power delivery: 65 W | Video inputs: USB-C (DisplayPort Alt Mode), HDMI 2.0, DisplayPort 1.4 | VESA mount: 100 × 100 mm'),
(10, 'birchline-compact-desk-46', 'Birchline', 'Birchline Compact Desk 46.5"', 'home_office', 'desks', '{desk}',
 'A birch plywood writing desk sized for alcoves and small rooms.', 'BL-CD-465', 'BL-465-NAT', null,
 22900, 1, 2, 'ret_30_free', 12,
 'Width: 46.5 in | Depth: 24 in | Height: 29.5 in | Top material: Birch plywood | Maximum load: 150 lb | Assembly: Required, about 20 minutes'),
(3, 'vireo-u2727', 'Vireo', 'Vireo U2727 27" 4K USB-C Monitor', 'home_office', 'monitors', '{monitor}',
 'A color-accurate 27-inch 4K monitor that powers a laptop over one USB-C cable.', 'U2727', 'VR-U2727-BK', null,
 32900, 1, 2, 'ret_30_free', 22,
 'Screen size: 27 in | Resolution: 3840 × 2160 (4K UHD) | Panel: IPS | Refresh rate: 60 Hz | USB-C power delivery: Up to 90 W | Video inputs: USB-C (DisplayPort Alt Mode), HDMI 2.0, DisplayPort 1.4 | VESA mount: 100 × 100 mm'),
(20, 'kestrel-mesh-task-chair', 'Kestrel', 'Kestrel Mesh Task Chair', 'home_office', 'chairs', '{chair}',
 'A breathable mesh task chair with adjustable lumbar support.', 'KS-MESH-TASK', 'KS-MESH-TASK-BLK', null,
 18900, 1, 2, 'ret_30_free', 30,
 'Lumbar support: Adjustable (height and depth) | Seat height: 17–21 in | Armrests: 2D adjustable | Maximum load: 275 lb | Upholstery: Mesh back, fabric seat'),
(40, 'loop-usb-c-cable-100w', 'Loop', 'Loop USB-C Cable 100 W, 2 m', 'home_office', 'cables', '{cable}',
 'A braided USB-C to USB-C cable with an e-marker chip for 100 W charging.', 'LOOP-C100-2M', 'LOOP-C100-2M-GR', null,
 1900, 1, 2, 'ret_30_free', 120,
 'Power rating: 100 W (20 V, 5 A, e-marked) | Length: 2 m | Connectors: USB-C to USB-C | Data rate: USB 2.0 (480 Mbps) | Jacket: Braided nylon'),
(50, 'pica-1080p-webcam', 'Pica', 'Pica 1080p Webcam', 'home_office', 'webcams', '{webcam}',
 'A plug-and-play 1080p webcam with dual microphones and a privacy shutter.', 'PICA-1080', 'PICA-1080-BK', null,
 4900, 1, 2, 'ret_30_free', 40,
 'Resolution: 1920 × 1080 at 30 fps | Field of view: 78° | Microphones: Dual, stereo | Connection: USB-A, 1.5 m cable | Privacy shutter: Yes'),
(7, 'birchline-mini-desk-44', 'Birchline', 'Birchline Mini Desk 44"', 'home_office', 'desks', '{desk}',
 'The smallest Birchline desk, for tight corners.', 'BL-DSK-440', 'BL-440-NAT', null,
 19900, 2, 4, 'ret_30_free', 9,
 'Width: 44 in | Depth: 22 in | Height: 29.5 in | Top material: Birch plywood | Maximum load: 120 lb | Assembly: Required, about 20 minutes'),
(8, 'birchline-standard-desk-48', 'Birchline', 'Birchline Standard Desk 48"', 'home_office', 'desks', '{desk}',
 'A full-depth birch desk with a cable tray.', 'BL-DSK-480', 'BL-480-NAT', null,
 25900, 2, 4, 'ret_30_free', 14,
 'Width: 48 in | Depth: 26 in | Height: 29.5 in | Top material: Birch plywood | Maximum load: 175 lb | Cable management: Under-desk tray'),
(9, 'birchline-wide-desk-52', 'Birchline', 'Birchline Wide Desk 52"', 'home_office', 'desks', '{desk}',
 'A wide birch desk with room for two monitors.', 'BL-DSK-520', 'BL-520-NAT', null,
 28900, 2, 5, 'ret_30_free', 6,
 'Width: 52 in | Depth: 26 in | Height: 29.5 in | Top material: Birch plywood | Maximum load: 200 lb | Cable management: Under-desk tray'),
(66, 'kestrel-basic-task-chair', 'Kestrel', 'Kestrel Basic Task Chair', 'home_office', 'chairs', '{chair}',
 'A simple, supportive task chair at an entry price.', 'KS-BTC-01', 'KS-BTC-01-GRY', null,
 12900, 1, 3, 'ret_30_free', 25,
 'Lumbar support: Fixed, built into backrest | Seat height: 17.5–21.5 in | Armrests: Fixed | Maximum load: 250 lb | Upholstery: Fabric'),
(11, 'kestrel-ergo-pro-chair', 'Kestrel', 'Kestrel Ergo Pro Chair', 'home_office', 'chairs', '{chair}',
 'A fully adjustable ergonomic chair with a headrest.', 'KS-EPC-01', 'KS-EPC-01-BLK', null,
 34900, 2, 5, 'ret_30_free', 8,
 'Lumbar support: Adjustable (dynamic) | Seat height: 16.5–21 in | Armrests: 4D adjustable | Headrest: Adjustable | Maximum load: 300 lb | Upholstery: Mesh'),
(12, 'halden-h24f', 'Halden', 'Halden H24F 24" Full HD Monitor', 'home_office', 'monitors', '{monitor}',
 'An affordable 24-inch Full HD display for everyday work.', 'H24F', 'H24F-US', null,
 13900, 1, 3, 'ret_30_free', 35,
 'Screen size: 24 in | Resolution: 1920 × 1080 (Full HD) | Panel: VA | Refresh rate: 75 Hz | Video inputs: HDMI 1.4, VGA | VESA mount: 75 × 75 mm'),
(13, 'vireo-p3223', 'Vireo', 'Vireo P3223 32" 4K Monitor', 'home_office', 'monitors', '{monitor}',
 'A large 32-inch 4K panel for spreadsheets and timelines.', 'P3223', 'VR-P3223-BK', null,
 44900, 2, 4, 'ret_30_free', 7,
 'Screen size: 31.5 in | Resolution: 3840 × 2160 (4K UHD) | Panel: IPS | Refresh rate: 60 Hz | Video inputs: HDMI 2.0 (×2), DisplayPort 1.4 | VESA mount: 100 × 100 mm'),
(14, 'halden-q27', 'Halden', 'Halden Q27 27" QHD Gaming Monitor', 'home_office', 'monitors', '{monitor}',
 'A fast 1440p panel for play after work.', 'Q27', 'Q27-US', null,
 25900, 1, 3, 'ret_30_free', 16,
 'Screen size: 27 in | Resolution: 2560 × 1440 (QHD) | Panel: IPS | Refresh rate: 165 Hz | Video inputs: HDMI 2.0 (×2), DisplayPort 1.4 | VESA mount: 100 × 100 mm'),
(15, 'loop-usb-c-cable-60w', 'Loop', 'Loop USB-C Cable 60 W, 1 m', 'home_office', 'cables', '{cable}',
 'A short USB-C cable for phones and tablets.', 'LP-C60-1M', 'LP-C60-1M-WH', null,
 1200, 1, 2, 'ret_30_free', 200,
 'Power rating: 60 W (20 V, 3 A) | Length: 1 m | Connectors: USB-C to USB-C | Data rate: USB 2.0 (480 Mbps) | Jacket: PVC'),
(16, 'loop-usb-c-cable-240w', 'Loop', 'Loop USB-C Cable 240 W, 2 m', 'home_office', 'cables', '{cable}',
 'A USB PD 3.1 extended-power cable for high-draw laptops.', 'LP-C240-2M', 'LP-C240-2M-BK', null,
 2900, 1, 2, 'ret_30_free', 80,
 'Power rating: 240 W (48 V, 5 A, USB PD 3.1 EPR) | Length: 2 m | Connectors: USB-C to USB-C | Data rate: USB 2.0 (480 Mbps) | Jacket: Braided nylon'),
(17, 'pica-4k-webcam', 'Pica', 'Pica 4K Webcam', 'home_office', 'webcams', '{webcam}',
 'A 4K webcam with autofocus and HDR.', 'PC-W4K', 'PC-W4K-BK', null,
 11900, 2, 4, 'ret_30_free', 15,
 'Resolution: 3840 × 2160 at 30 fps | Field of view: 90° | Autofocus: Yes | Microphones: Dual, stereo | Connection: USB-C | Privacy shutter: Yes'),
(18, 'loop-usb-c-dock-7-in-1', 'Loop', 'Loop USB-C Dock 7-in-1', 'home_office', 'docks', '{dock}',
 'A compact USB-C hub with HDMI, Ethernet and pass-through charging.', 'LP-DK7', 'LP-DK7-SG', null,
 8900, 1, 3, 'ret_30_free', 45,
 'Power pass-through: Up to 100 W | Video output: HDMI 2.0, 4K at 60 Hz | Ports: USB-A (×2), USB-C data, Ethernet, SD, microSD | Host connection: USB-C, 20 cm cable'),
(19, 'loop-thunderbolt-4-dock', 'Loop', 'Loop Thunderbolt 4 Dock', 'home_office', 'docks', '{dock}',
 'A Thunderbolt 4 dock that drives two displays.', 'LP-TB4', 'LP-TB4-SG', null,
 22900, 2, 4, 'ret_30_free', 10,
 'Power delivery to host: 96 W | Video output: DisplayPort 1.4 (×2), up to two 4K displays at 60 Hz | Ports: Thunderbolt 4 (×3), USB-A (×4), Ethernet 2.5 GbE | Host connection: Thunderbolt 4, 0.8 m cable'),
(67, 'loop-hdmi-2-1-cable', 'Loop', 'Loop HDMI 2.1 Cable, 2 m', 'home_office', 'cables', '{cable}',
 'An Ultra High Speed HDMI cable.', 'LP-HD21-2M', 'LP-HD21-2M-BK', null,
 1500, 1, 2, 'ret_30_free', 90,
 'Standard: HDMI 2.1, Ultra High Speed | Maximum bandwidth: 48 Gbps | Length: 2 m | Connectors: HDMI to HDMI'),
(21, 'birchline-single-monitor-arm', 'Birchline', 'Birchline Single Monitor Arm', 'home_office', 'accessories', '{monitor_arm}',
 'A gas-spring arm that clamps to desks up to 3.5 in thick.', 'BL-ARM-1', 'BL-ARM-1-BK', null,
 7900, 2, 4, 'ret_30_free', 20,
 'VESA compatibility: 75 × 75 mm, 100 × 100 mm | Screen size range: 17–32 in | Load capacity: 4.4–20 lb | Desk clamp range: 0.4–3.5 in'),
(22, 'birchline-felt-desk-mat', 'Birchline', 'Birchline Felt Desk Mat', 'home_office', 'accessories', '{accessory}',
 'A merino felt mat that quiets the desk surface.', 'BL-MAT', 'BL-MAT-CHR', null,
 2900, 1, 3, 'ret_30_free', 60,
 'Dimensions: 36 × 16 in | Thickness: 3 mm | Material: Merino wool felt | Color: Charcoal'),
(23, 'kestrel-adjustable-footrest', 'Kestrel', 'Kestrel Adjustable Footrest', 'home_office', 'accessories', '{accessory}',
 'A tilting footrest with three height settings.', 'KS-FR', 'KS-FR-BLK', null,
 3900, 2, 4, 'ret_30_free', 26,
 'Dimensions: 18 × 13 in | Height settings: 3.5 in, 4.5 in, 5.5 in | Tilt range: 0–20°'),
(24, 'pica-usb-desk-microphone', 'Pica', 'Pica USB Desk Microphone', 'home_office', 'audio', '{microphone}',
 'A cardioid USB microphone for calls and recordings.', 'PC-MIC', 'PC-MIC-BK', null,
 6900, 1, 3, 'ret_30_free', 18,
 'Pickup pattern: Cardioid | Sample rate: 48 kHz, 24-bit | Connection: USB-C | Headphone output: 3.5 mm'),
(25, 'pica-key-light', 'Pica', 'Pica Key Light', 'home_office', 'lighting', '{light}',
 'A dimmable LED panel light for video calls.', 'PC-LGT', 'PC-LGT-WH', null,
 5900, 1, 3, 'ret_30_free', 24,
 'Brightness: Up to 1,400 lumens | Color temperature: 2900–7000 K | Power: USB-C, 18 W | Mount: Desk clamp'),
-- Apparel ------------------------------------------------------------------------------------
(26, 'marlow-navy-wrap-dress', 'Marlow', 'Marlow Navy Wrap Dress', 'apparel', 'dresses', '{dress}',
 'A cotton-stretch wrap dress with a tie waist and midi length.', 'MW-NWD-04', 'MW-NWD-NVY-04', 'Size 4',
 16800, 3, 5, 'ret_30_free', 6,
 'Color: Navy | Fabric: 97% cotton, 3% elastane | Size: 4 | Garment chest: 35.5 in | Garment waist: 28.5 in | Garment length: 42 in | Care: Machine wash cold'),
(27, 'marlow-navy-wrap-dress', 'Marlow', 'Marlow Navy Wrap Dress', 'apparel', 'dresses', '{dress}',
 'A cotton-stretch wrap dress with a tie waist and midi length.', 'MW-NWD-06', 'MW-NWD-NVY-06', 'Size 6',
 16800, 3, 5, 'ret_30_free', 8,
 'Color: Navy | Fabric: 97% cotton, 3% elastane | Size: 6 | Garment chest: 36.5 in | Garment waist: 29.5 in | Garment length: 42.5 in | Care: Machine wash cold'),
(28, 'marlow-navy-wrap-dress', 'Marlow', 'Marlow Navy Wrap Dress', 'apparel', 'dresses', '{dress}',
 'A cotton-stretch wrap dress with a tie waist and midi length.', 'MW-NWD-08', 'MW-NWD-NVY-08', 'Size 8',
 16800, 3, 5, 'ret_30_free', 5,
 'Color: Navy | Fabric: 97% cotton, 3% elastane | Size: 8 | Garment chest: 37.5 in | Garment waist: 30.5 in | Garment length: 43 in | Care: Machine wash cold'),
(29, 'marlow-heather-wrap-dress', 'Marlow', 'Marlow Heather Navy Wrap Dress', 'apparel', 'dresses', '{dress}',
 'The wrap dress in a heathered jersey blend.', 'MW-HWD-06', 'MW-HWD-HNV-06', 'Size 6',
 14800, 3, 5, 'ret_30_free', 10,
 'Color: Heather navy | Fabric: 60% cotton, 40% polyester | Size: 6 | Garment chest: 36.5 in | Garment waist: 30 in | Garment length: 42.5 in | Care: Machine wash cold'),
(30, 'marlow-navy-sheath-dress', 'Marlow', 'Marlow Navy Sheath Dress', 'apparel', 'dresses', '{dress}',
 'A tailored sheath in fine wool suiting.', 'MW-NSD-06', 'MW-NSD-NVY-06', 'Size 6',
 15800, 3, 5, 'ret_30_fee', 7,
 'Color: Navy | Fabric: 95% wool, 5% elastane | Lining: 100% polyester | Size: 6 | Garment chest: 35 in | Garment waist: 28 in | Garment length: 39 in | Care: Dry clean'),
(31, 'marlow-linen-shift-dress', 'Marlow', 'Marlow Linen Shift Dress', 'apparel', 'dresses', '{dress}',
 'An easy linen shift with side pockets.', 'MW-LSD-06', 'MW-LSD-SND-06', 'Size 6',
 13800, 2, 4, 'ret_30_free', 12,
 'Color: Sand | Fabric: 100% linen | Size: 6 | Garment chest: 38 in | Garment length: 40 in | Care: Machine wash cold'),
(32, 'marlow-navy-midi-dress', 'Marlow', 'Marlow Navy Satin Midi Dress', 'apparel', 'dresses', '{dress}',
 'A bias-cut satin midi dress. Final sale.', 'MW-SMD-06', 'MW-SMD-NVY-06', 'Size 6',
 12800, 2, 4, 'final_sale', 4,
 'Color: Navy | Fabric: 100% viscose | Size: 6 | Garment chest: 35 in | Garment length: 46 in | Care: Hand wash'),
(33, 'marlow-navy-suit-jacket', 'Marlow', 'Marlow Navy Suit Jacket', 'apparel', 'suits', '{jacket}',
 'A two-button jacket in stretch wool.', 'MW-NSJ-38R', 'MW-NSJ-NVY-38R', 'Size 38R',
 29800, 3, 5, 'ret_30_free', 5,
 'Color: Navy | Fabric: 98% wool, 2% elastane | Size: 38R | Garment chest: 40 in | Sleeve length: 25 in | Garment length: 29.5 in | Care: Dry clean'),
(34, 'marlow-navy-suit-jacket', 'Marlow', 'Marlow Navy Suit Jacket', 'apparel', 'suits', '{jacket}',
 'A two-button jacket in stretch wool.', 'MW-NSJ-40R', 'MW-NSJ-NVY-40R', 'Size 40R',
 29800, 3, 5, 'ret_30_free', 6,
 'Color: Navy | Fabric: 98% wool, 2% elastane | Size: 40R | Garment chest: 42 in | Sleeve length: 25.5 in | Garment length: 30 in | Care: Dry clean'),
(35, 'marlow-navy-suit-trousers', 'Marlow', 'Marlow Navy Suit Trousers', 'apparel', 'suits', '{trousers}',
 'Flat-front trousers that match the suit jacket.', 'MW-NST-32', 'MW-NST-NVY-32', 'Waist 32',
 14800, 3, 5, 'ret_30_free', 7,
 'Color: Navy | Fabric: 98% wool, 2% elastane | Size: 32 | Garment waist: 32 in | Inseam: 32 in | Care: Dry clean'),
(36, 'marlow-navy-suit-trousers', 'Marlow', 'Marlow Navy Suit Trousers', 'apparel', 'suits', '{trousers}',
 'Flat-front trousers that match the suit jacket.', 'MW-NST-34', 'MW-NST-NVY-34', 'Waist 34',
 14800, 3, 5, 'ret_30_free', 7,
 'Color: Navy | Fabric: 98% wool, 2% elastane | Size: 34 | Garment waist: 34 in | Inseam: 32 in | Care: Dry clean'),
(37, 'marlow-oxford-shirt', 'Marlow', 'Marlow Oxford Shirt', 'apparel', 'shirts', '{shirt}',
 'A crisp white oxford-cloth shirt.', 'MW-OXS-M', 'MW-OXS-WHT-M', 'Size M',
 7800, 2, 4, 'ret_30_free', 20,
 'Color: White | Fabric: 100% cotton | Size: M | Garment chest: 42 in | Sleeve length: 34 in | Care: Machine wash warm'),
(38, 'marlow-linen-shirt', 'Marlow', 'Marlow Linen Shirt', 'apparel', 'shirts', '{shirt}',
 'A relaxed linen shirt for warm evenings.', 'MW-LNS-M', 'MW-LNS-SKY-M', 'Size M',
 8800, 2, 4, 'ret_30_free', 14,
 'Color: Sky blue | Fabric: 100% linen | Size: M | Garment chest: 44 in | Care: Machine wash cold'),
(39, 'marlow-silk-tie', 'Marlow', 'Marlow Silk Tie', 'apparel', 'accessories', '{tie}',
 'A navy silk twill tie.', 'MW-TIE-NVY', 'MW-TIE-NVY', null,
 5800, 2, 4, 'ret_30_free', 30,
 'Color: Navy | Fabric: 100% silk | Width: 3 in | Length: 58 in'),
(68, 'marlow-pleated-skirt', 'Marlow', 'Marlow Pleated Midi Skirt', 'apparel', 'skirts', '{skirt}',
 'A knife-pleated midi skirt with an elastic back.', 'MW-PSK-S', 'MW-PSK-NVY-S', 'Size S',
 8800, 2, 4, 'ret_30_free', 11,
 'Color: Navy | Fabric: 100% polyester | Size: S | Garment waist: 27 in | Garment length: 31 in | Care: Machine wash cold'),
(41, 'marlow-knit-cardigan', 'Marlow', 'Marlow Knit Cardigan', 'apparel', 'knitwear', '{cardigan}',
 'A lightweight cardigan for over-dress layering.', 'MW-KCD-S', 'MW-KCD-NVY-S', 'Size S',
 9600, 2, 4, 'ret_30_free', 13,
 'Color: Navy | Fabric: 80% cotton, 20% nylon | Size: S | Garment chest: 36 in | Care: Hand wash'),
(42, 'marlow-leather-belt', 'Marlow', 'Marlow Leather Belt', 'apparel', 'accessories', '{belt}',
 'A slim leather belt with a brass buckle.', 'MW-BLT-M', 'MW-BLT-BRN-M', 'Size M',
 4800, 2, 4, 'ret_30_free', 25,
 'Color: Brown | Material: Full-grain leather | Size: M (32–36 in) | Width: 1 in'),
(43, 'aster-block-heel', 'Aster', 'Aster Block Heel', 'apparel', 'shoes', '{shoes}',
 'A suede pump on a stable block heel.', 'AS-BLK-07', 'AS-BLK-NVY-07', 'Size 7',
 7400, 3, 5, 'ret_30_fee', 6,
 'Color: Navy | Upper: Suede | Heel height: 2.5 in | Size: 7 (US women''s) | Width: Medium'),
(44, 'aster-block-heel', 'Aster', 'Aster Block Heel', 'apparel', 'shoes', '{shoes}',
 'A suede pump on a stable block heel.', 'AS-BLK-08', 'AS-BLK-NVY-08', 'Size 8',
 7400, 3, 5, 'ret_30_fee', 9,
 'Color: Navy | Upper: Suede | Heel height: 2.5 in | Size: 8 (US women''s) | Width: Medium'),
(45, 'aster-pointed-pump', 'Aster', 'Aster Pointed Pump', 'apparel', 'shoes', '{shoes}',
 'A pointed-toe leather pump.', 'AS-PPM-08', 'AS-PPM-BLK-08', 'Size 8',
 9800, 3, 5, 'ret_30_free', 7,
 'Color: Black | Upper: Leather | Heel height: 3.5 in | Size: 8 (US women''s) | Width: Medium'),
(46, 'aster-strappy-sandal', 'Aster', 'Aster Strappy Sandal', 'apparel', 'shoes', '{shoes}',
 'A metallic strappy sandal with a low heel.', 'AS-STS-08', 'AS-STS-GLD-08', 'Size 8',
 8600, 3, 5, 'ret_14_free', 8,
 'Color: Gold | Upper: Metallic leather | Heel height: 1.5 in | Size: 8 (US women''s)'),
(47, 'aster-leather-loafer', 'Aster', 'Aster Leather Loafer', 'apparel', 'shoes', '{shoes}',
 'A classic penny loafer.', 'AS-LLF-08', 'AS-LLF-BRN-08', 'Size 8',
 11800, 3, 5, 'ret_30_free', 10,
 'Color: Brown | Upper: Leather | Sole: Leather | Size: 8 (US women''s)'),
(48, 'aster-ballet-flat', 'Aster', 'Aster Ballet Flat', 'apparel', 'shoes', '{shoes}',
 'A soft leather ballet flat.', 'AS-BLF-08', 'AS-BLF-NVY-08', 'Size 8',
 7800, 2, 4, 'ret_14_free', 12,
 'Color: Navy | Upper: Leather | Size: 8 (US women''s)'),
(49, 'aster-mini-clutch', 'Aster', 'Aster Mini Clutch', 'apparel', 'accessories', '{bag}',
 'A structured evening clutch with a chain strap.', 'AS-CLT', 'AS-CLT-NVY', null,
 6400, 2, 4, 'ret_30_free', 15,
 'Color: Navy | Material: Satin | Dimensions: 8 × 5 × 2 in'),
(69, 'marlow-cashmere-scarf', 'Marlow', 'Marlow Cashmere Scarf', 'apparel', 'accessories', '{scarf}',
 'A featherweight cashmere scarf.', 'MW-CSF', 'MW-CSF-OAT', null,
 9800, 2, 4, 'ret_30_free', 9,
 'Color: Oatmeal | Fabric: 100% cashmere | Dimensions: 70 × 12 in'),
-- Travel -------------------------------------------------------------------------------------
(51, 'fieldnote-21-carry-on', 'Fieldnote', 'Fieldnote 21" Carry-On', 'travel', 'luggage', '{bag}',
 'A hardside spinner sized for US domestic overhead bins.', 'FN-CO21', 'FN-CO21-GRN', null,
 24500, 2, 4, 'ret_30_free', 11,
 'Dimensions (H × W × D): 21.5 × 14 × 9 in (wheels and handles included) | Weight: 7.1 lb | Shell: Polycarbonate | Wheels: 4 spinner'),
(52, 'atlas-international-carry-on', 'Atlas', 'Atlas "International" Carry-On', 'travel', 'luggage', '{bag}',
 'An expandable softside carry-on.', 'AT-INT', 'AT-INT-BLK', null,
 21900, 2, 4, 'ret_30_free', 9,
 'Dimensions (H × W × D): 21.6 × 13.8 × 10.8 in (wheels and handles included) | Weight: 6.4 lb | Shell: Ballistic nylon | Wheels: 2 inline'),
(53, 'fieldnote-25-checked-bag', 'Fieldnote', 'Fieldnote 25" Checked Bag', 'travel', 'luggage', '{bag}',
 'A medium hardside checked spinner.', 'FN-CK25', 'FN-CK25-GRN', null,
 29500, 2, 4, 'ret_30_free', 6,
 'Dimensions (H × W × D): 25.5 × 17 × 11 in | Weight: 9.3 lb | Shell: Polycarbonate | Wheels: 4 spinner'),
(54, 'atlas-weekender-duffel', 'Atlas', 'Atlas Weekender Duffel', 'travel', 'luggage', '{bag}',
 'A waxed-canvas duffel for short trips.', 'AT-WKD', 'AT-WKD-OLV', null,
 12900, 2, 4, 'ret_30_free', 14,
 'Dimensions (H × W × D): 11 × 20 × 10 in | Weight: 2.9 lb | Material: Waxed canvas'),
(55, 'volt-10k-power-bank', 'Volt', 'Volt 10K Power Bank', 'travel', 'power', '{power_bank}',
 'A pocketable 10,000 mAh battery with USB-C fast charging.', 'VT-PB10', 'VT-PB10-BK', null,
 2900, 1, 3, 'ret_30_free', 70,
 'Capacity: 10,000 mAh | Energy: 37 Wh | Output: USB-C PD 20 W | Weight: 7.4 oz'),
(56, 'volt-20k-power-bank', 'Volt', 'Volt 20K Power Bank', 'travel', 'power', '{power_bank}',
 'A 20,000 mAh battery that charges a laptop over USB-C.', 'VT-PB20', 'VT-PB20-BK', null,
 4900, 1, 3, 'ret_30_free', 55,
 'Capacity: 20,000 mAh | Output: USB-C PD 45 W | Weight: 12.7 oz'),
(57, 'volt-26800-power-bank', 'Volt', 'Volt 26.8K Power Bank', 'travel', 'power', '{power_bank}',
 'The largest Volt battery that stays under the 100 Wh cabin limit.', 'VT-PB268', 'VT-PB268-BK', null,
 7900, 1, 3, 'ret_30_free', 30,
 'Capacity: 26,800 mAh | Energy: 99.16 Wh | Output: USB-C PD 65 W | Weight: 1.3 lb'),
(58, 'volt-30k-power-bank', 'Volt', 'Volt 30K Power Bank', 'travel', 'power', '{power_bank}',
 'A 30,000 mAh battery for long trips.', 'VT-PB30', 'VT-PB30-BK', null,
 8900, 1, 3, 'ret_30_free', 20,
 'Capacity: 30,000 mAh | Output: USB-C PD 65 W | Weight: 1.5 lb'),
(59, 'volt-universal-travel-adapter', 'Volt', 'Volt Universal Travel Adapter', 'travel', 'power', '{adapter}',
 'One adapter for more than 150 countries, with USB-C charging.', 'VT-UTA', 'VT-UTA-WH', null,
 3400, 1, 3, 'ret_30_free', 40,
 'Plug types: A, C, G, I | Input voltage: 100–250 V AC | USB output: USB-C 30 W, USB-A (×2) | Voltage conversion: No'),
(60, 'volt-eu-plug-adapter', 'Volt', 'Volt Type C Plug Adapter (EU), 2-pack', 'travel', 'power', '{adapter}',
 'Simple Type C plug adapters for continental Europe.', 'VT-EUC-2', 'VT-EUC-2-WH', null,
 1200, 1, 3, 'ret_30_free', 100,
 'Plug types: C | Input voltage: 100–250 V AC | Pack size: 2 | Voltage conversion: No'),
(61, 'volt-voltage-converter', 'Volt', 'Volt Voltage Converter 2000 W', 'travel', 'power', '{converter}',
 'A step-down converter for 110 V appliances abroad.', 'VT-VC2K', 'VT-VC2K-BK', null,
 4500, 2, 4, 'ret_30_free', 12,
 'Input voltage: 220–240 V AC | Output voltage: 110–120 V AC | Maximum load: 2000 W (heating appliances), 50 W (electronics)'),
(62, 'fieldnote-travel-bottles-3-4-oz', 'Fieldnote', 'Fieldnote Silicone Travel Bottles 3.4 oz, 3-pack', 'travel', 'toiletries', '{toiletry_bottle}',
 'Leak-proof silicone bottles at the TSA carry-on limit.', 'FN-TB34-3', 'FN-TB34-3-CLR', null,
 1800, 1, 3, 'ret_30_free', 65,
 'Capacity: 3.4 fl oz (100 ml) each | Pack size: 3 | Material: Food-grade silicone'),
(63, 'fieldnote-squeeze-bottles-4-oz', 'Fieldnote', 'Fieldnote Squeeze Bottles 4 oz, 2-pack', 'travel', 'toiletries', '{toiletry_bottle}',
 'Larger squeeze bottles for checked bags.', 'FN-SB4-2', 'FN-SB4-2-CLR', null,
 1400, 1, 3, 'ret_30_free', 50,
 'Capacity: 4 fl oz (118 ml) each | Pack size: 2 | Material: Silicone'),
(64, 'fieldnote-packing-cubes', 'Fieldnote', 'Fieldnote Packing Cubes, set of 4', 'travel', 'organization', '{accessory}',
 'Compression packing cubes in four sizes.', 'FN-PC4', 'FN-PC4-GRN', null,
 3900, 2, 4, 'ret_30_free', 28,
 'Pack size: 4 | Material: Recycled ripstop nylon | Sizes: S, M, L, Slim'),
(65, 'atlas-travel-pillow', 'Atlas', 'Atlas Memory Foam Travel Pillow', 'travel', 'comfort', '{accessory}',
 'A packable memory-foam neck pillow.', 'AT-TPL', 'AT-TPL-GRY', null,
 3200, 2, 4, 'ret_14_free', 33,
 'Material: Memory foam, knit cover | Packed size: 6 × 6 × 4 in | Weight: 9 oz');

-- GS1 check digit for a 13-digit body -> GTIN-14.
create function pg_temp.gtin14(p_n integer) returns text language sql immutable as $$
  select body || ((10 - (
    select sum(substr(body, 13 - i, 1)::int * case when i % 2 = 0 then 3 else 1 end) % 10
    from generate_series(0, 12) as i
  )) % 10)::text
  from (select '00812345' || lpad(p_n::text, 5, '0') as body) b;
$$;

create function pg_temp.spec(p_spec text) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object(
    'name', split_part(kv, ': ', 1),
    'value', substr(kv, strpos(kv, ': ') + 2)
  ) order by ord)
  from unnest(string_to_array(p_spec, ' | ')) with ordinality as t(kv, ord);
$$;

insert into demomart.products (slug, brand, name, department, category, roles, description)
select distinct on (slug) slug, brand, product_name, department, category, roles, description
from seed_catalog
order by slug, n;

insert into demomart.variants (product_id, sku, gtin, mpn, option_label, sort_order)
select p.id, s.sku, pg_temp.gtin14(s.n), s.mpn, s.option_label, s.n
from seed_catalog s join demomart.products p on p.slug = s.slug;

insert into demomart.listings (variant_id, title, spec)
select v.id, s.product_name || coalesce(' — ' || s.option_label, ''), pg_temp.spec(s.spec)
from seed_catalog s join demomart.variants v on v.sku = s.sku;

insert into demomart.offers (
  id, listing_id, seller_id, price_minor, availability, stock,
  delivery_min_days, delivery_max_days, final_sale, return_policy_id
)
select 'dm_off_' || (48000 + s.n * 100), l.id, 'dm_seller_1', s.price_minor,
  case when s.stock = 0 then 'out_of_stock' when s.stock < 5 then 'limited' else 'in_stock' end,
  s.stock, s.delivery_min, s.delivery_max, s.return_policy = 'final_sale', s.return_policy
from seed_catalog s
join demomart.variants v on v.sku = s.sku
join demomart.listings l on l.variant_id = v.id;

-- ProofCart's catalog as the demomart adapter would first ingest it. Offers are stored already
-- stale (fresh_until = retrieved_at), so nothing is proven until a live ACP/JSON-LD refresh.
-- Facts are not seeded: every fact must come from a real source snapshot.
insert into public.products (source, external_id, merchant_id, title, brand, gtin, mpn, category, roles, upid)
select 'demomart', s.sku, 'demomart', l.title, s.brand, v.gtin, s.mpn, s.category, s.roles, 'demomart:' || s.slug
from seed_catalog s
join demomart.variants v on v.sku = s.sku
join demomart.listings l on l.variant_id = v.id;

insert into public.product_external_refs (product_id, source, external_id, upid, gtin, url)
select p.id, 'demomart', p.external_id, p.upid, p.gtin, 'http://localhost:3001/p/' || s.slug
from public.products p join seed_catalog s on s.sku = p.external_id
where p.source = 'demomart';

insert into public.offers (
  product_id, source, external_id, merchant_id, seller_id, price_minor, currency, availability,
  delivery_earliest, delivery_latest, final_sale, return_policy, url, retrieved_at, fresh_until
)
select p.id, 'demomart', o.id, 'demomart', o.seller_id, o.price_minor, o.currency,
  (case o.availability when 'limited' then 'limited' when 'out_of_stock' then 'out_of_stock' else 'in_stock' end)::public.availability,
  current_date + o.delivery_min_days, current_date + o.delivery_max_days, o.final_sale, pol.terms,
  'http://localhost:3001/p/' || s.slug, now(), now()
from seed_catalog s
join public.products p on p.source = 'demomart' and p.external_id = s.sku
join demomart.variants v on v.sku = s.sku
join demomart.listings l on l.variant_id = v.id
join demomart.offers o on o.listing_id = l.id
join demomart.policies pol on pol.id = o.return_policy_id;

-- Kits (SDD §11.5, §16.1) ------------------------------------------------------------------------
insert into public.kits (slug, title, pack, description, hero_figure, sort_order) values
  ('starter-home-office', 'Starter home office', 'home-office',
   'A desk that fits the space, a 27" 4K monitor that charges your laptop over one cable, and a chair with lumbar support.',
   'scout-desk', 1),
  ('wedding-guest', 'Wedding guest', 'apparel',
   'A navy dress and shoes that arrive with time to exchange, and stay returnable.',
   'scout-garment', 2),
  ('carry-on-kit', 'Carry-on kit', 'travel',
   'A bag that fits the overhead bin, a power bank the airline allows, and liquids under the limit.',
   'scout-suitcase', 3);

insert into public.kit_requirements (kit_slug, requirement_key, importance, sort_order, spec)
select kit_slug, spec ->> 'id', (spec ->> 'importance')::public.requirement_importance, ord, spec
from (values
  ('starter-home-office', 1, '{"id": "r_budget", "scope": "basket", "field": "basket.delivered_total", "op": "lte", "target": {"amountMinor": 100000, "currency": "USD"}, "importance": "hard", "evidence": {"minStateToPass": "verified"}, "materiality": "always", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "budget"}}'::jsonb),
  ('starter-home-office', 2, '{"id": "r_desk_width", "scope": "item", "role": "desk", "field": "desk.width", "op": "lte", "target": {"value": 48, "unit": "in"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "desk_fits_space"}}'),
  ('starter-home-office', 3, '{"id": "r_monitor_size", "scope": "item", "role": "monitor", "field": "monitor.diagonal", "op": "eq", "target": {"value": 27, "unit": "in"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "monitor_size"}}'),
  ('starter-home-office', 4, '{"id": "r_monitor_4k", "scope": "item", "role": "monitor", "field": "monitor.resolution", "op": "eq", "target": "4k", "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "monitor_resolution"}}'),
  ('starter-home-office', 5, '{"id": "r_usb_pd", "scope": "item", "role": "monitor", "field": "monitor.usb_c_pd_watts", "op": "gte", "target": {"value": 65, "unit": "W"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "usb_c_pd_for_laptop"}}'),
  ('starter-home-office', 6, '{"id": "r_cable_pd", "scope": "item", "role": "cable", "field": "cable.usb_pd_watts", "op": "gte", "target": {"value": 65, "unit": "W"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "cable_pd"}}'),
  ('starter-home-office', 7, '{"id": "r_no_substitutions", "scope": "order", "field": "order.substitutions_allowed", "op": "eq", "target": false, "importance": "hard", "evidence": {"minStateToPass": "verified"}, "materiality": "always", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "no_substitutions"}}'),
  ('starter-home-office', 8, '{"id": "r_chair_lumbar", "scope": "item", "role": "chair", "field": "chair.adjustable_lumbar", "op": "eq", "target": true, "importance": "preference", "weight": 0.5, "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "chair_lumbar"}}'),
  ('starter-home-office', 9, '{"id": "r_chair_comfort", "scope": "item", "role": "chair", "field": "chair.comfort", "op": "exists", "target": true, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "home-office", "ruleId": "chair_comfort"}}'),
  ('wedding-guest', 1, '{"id": "r_dress_fit", "scope": "item", "role": "dress", "field": "apparel.garment_chest", "op": "between", "target": {"min": {"value": 35.5, "unit": "in"}, "max": {"value": 36.5, "unit": "in"}}, "importance": "hard", "evidence": {"minStateToPass": "estimated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "garment_fit"}}'),
  ('wedding-guest', 2, '{"id": "r_dress_returnable", "scope": "item", "role": "dress", "field": "offer.final_sale", "op": "eq", "target": false, "importance": "hard", "evidence": {"minStateToPass": "verified"}, "materiality": "always", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "returnable"}}'),
  ('wedding-guest', 3, '{"id": "r_arrive_by", "scope": "basket", "field": "basket.delivery_latest", "op": "lte", "target": "2026-10-07", "importance": "hard", "evidence": {"minStateToPass": "estimated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "exchange_buffer"}}'),
  ('wedding-guest', 4, '{"id": "r_no_wool", "scope": "item", "role": "dress", "field": "apparel.fiber", "op": "excludes", "target": ["wool"], "importance": "preference", "weight": 0.5, "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "fiber_excludes"}}'),
  ('wedding-guest', 5, '{"id": "r_shoes_return_fee", "scope": "item", "role": "shoes", "field": "offer.return_fee", "op": "lte", "target": {"amountMinor": 0, "currency": "USD"}, "importance": "preference", "weight": 0.3, "evidence": {"minStateToPass": "verified"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "return_fee"}}'),
  ('wedding-guest', 6, '{"id": "r_looks", "scope": "item", "role": "dress", "field": "apparel.looks", "op": "exists", "target": true, "importance": "preference", "weight": 0.2, "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "apparel", "ruleId": "looks"}}'),
  ('carry-on-kit', 1, '{"id": "r_bag_dims", "scope": "item", "role": "bag", "field": "bag.dimensions", "op": "lte", "target": {"dims": [22, 14, 9], "unit": "in"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "travel", "ruleId": "carry_on_size"}}'),
  ('carry-on-kit', 2, '{"id": "r_power_bank_wh", "scope": "item", "role": "power_bank", "field": "power_bank.energy", "op": "lte", "target": {"value": 100, "unit": "Wh"}, "importance": "hard", "evidence": {"minStateToPass": "estimated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "travel", "ruleId": "power_bank_limit"}}'),
  ('carry-on-kit', 3, '{"id": "r_liquids", "scope": "item", "role": "toiletry_bottle", "field": "liquid.volume", "op": "lte", "target": {"value": 100, "unit": "ml"}, "importance": "hard", "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "travel", "ruleId": "liquids_limit"}}'),
  ('carry-on-kit', 4, '{"id": "r_plug_type", "scope": "item", "role": "adapter", "field": "adapter.plug_types", "op": "contains", "target": ["G"], "importance": "preference", "weight": 0.5, "evidence": {"minStateToPass": "source_stated"}, "materiality": "on_verdict_change", "provenance": {"kind": "pack_default", "pack": "travel", "ruleId": "plug_type"}}')
) as r(kit_slug, ord, spec);

insert into public.kit_items (kit_slug, role, product_id, sort_order)
select k.kit_slug, k.role, p.id, k.ord
from (values
  ('starter-home-office', 'desk', 'BL-CD-465', 1),
  ('starter-home-office', 'chair', 'KS-MESH-TASK', 2),
  ('starter-home-office', 'monitor', 'U2727', 3),
  ('starter-home-office', 'cable', 'LOOP-C100-2M', 4),
  ('starter-home-office', 'webcam', 'PICA-1080', 5),
  ('wedding-guest', 'dress', 'MW-NWD-06', 1),
  ('wedding-guest', 'shoes', 'AS-BLK-08', 2),
  ('carry-on-kit', 'bag', 'FN-CO21', 1),
  ('carry-on-kit', 'power_bank', 'VT-PB20', 2),
  ('carry-on-kit', 'toiletry_bottle', 'FN-TB34-3', 3),
  ('carry-on-kit', 'adapter', 'VT-UTA', 4)
) as k(kit_slug, role, sku, ord)
join public.products p on p.source = 'demomart' and p.external_id = k.sku;

drop table seed_catalog;

-- Offers carry the listed pack size, so the Chaos Panel's pack_size_shrink has something to shrink.
update demomart.offers o
set pack_size = substring(e.value ->> 'value' from '^\d+')::integer
from demomart.listings l, jsonb_array_elements(l.spec) e
where o.listing_id = l.id and lower(e.value ->> 'name') = 'pack size'
  and substring(e.value ->> 'value' from '^\d+') is not null;

-- The state the Chaos Panel's Reset restores (demomart.reset_catalog).
select demomart.capture_baseline();
