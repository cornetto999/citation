import type { ViolationCode } from "@/types";

export const VIOLATION_CODES: ViolationCode[] = [
  // Licensing & registration
  {
    code: "LIC-01",
    label: "Driving without a license",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-02",
    label: "Expired driver's license",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-03",
    label: "Failure to carry driver's license",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-04",
    label: "Failure to show or surrender driver's license",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-05",
    label: "Driving with a suspended, invalid, or revoked license",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-06",
    label: "Student driver driving without a licensed driver",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-07",
    label: "Allowing unlicensed or improperly licensed person to drive",
    fine: 1500,
    category: "Licensing",
  },
  {
    code: "LIC-08",
    label: "Failure to sign driver's license",
    fine: 500,
    category: "Licensing",
  },
  {
    code: "REG-01",
    label: "Unregistered or delinquent vehicle registration",
    fine: 1500,
    category: "Registration",
  },
  {
    code: "REG-02",
    label: "Failure to carry OR/CR",
    fine: 500,
    category: "Registration",
  },
  {
    code: "REG-03",
    label: "Illegal transfer of plates, tags, or stickers",
    fine: 1500,
    category: "Registration",
  },
  {
    code: "REG-04",
    label: "Unauthorized or improvised number plates",
    fine: 500,
    category: "Registration",
  },
  {
    code: "REG-05",
    label: "Expired commemorative plates or stickers",
    fine: 500,
    category: "Registration",
  },

  // Moving & road rules
  { code: "MOV-01", label: "Reckless driving", fine: 1500, category: "Moving" },
  { code: "MOV-02", label: "Over speeding", fine: 1500, category: "Moving" },
  {
    code: "MOV-03",
    label: "Drag racing / Speed contest",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-04",
    label: "Disregarding traffic signs (including Red Light)",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-05",
    label: "Obstruction to traffic",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-06",
    label: "Driving against traffic (Counterflowing)",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-07",
    label: "Illegal left turn / right turn / overtaking",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-08",
    label: "Blocking an intersection or free right turn lane",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-09",
    label: "Failure to give proper turn or stop signals",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-10",
    label: "Driving under the influence of liquor or drugs",
    fine: 1500,
    category: "Moving",
  },
  {
    code: "MOV-11",
    label: "Failure to give way to police, fire, or ambulances",
    fine: 1500,
    category: "Moving",
  },

  // Safety & equipment
  {
    code: "SAF-01",
    label: "Failure to wear the prescribed seat belt",
    fine: 1500,
    category: "Safety",
  },
  {
    code: "SAF-02",
    label: "No helmet when driving or riding a motorcycle",
    fine: 500,
    category: "Safety",
  },
  {
    code: "SAF-03",
    label: "Allowing a passenger to ride on top of a vehicle",
    fine: 500,
    category: "Safety",
  },
  {
    code: "EQP-01",
    label: "Defective brakes",
    fine: 1500,
    category: "Equipment",
  },
  {
    code: "EQP-02",
    label: "No headlights or defective taillights",
    fine: 1500,
    category: "Equipment",
  },
  {
    code: "EQP-03",
    label: "Operating vehicle with heavily tinted front windshield",
    fine: 1500,
    category: "Equipment",
  },
  {
    code: "EQP-04",
    label: "Defective or broken handbrakes, horn, or windshield",
    fine: 500,
    category: "Equipment",
  },
  {
    code: "EQP-05",
    label: "Glaring front or rear accessories",
    fine: 500,
    category: "Equipment",
  },
  {
    code: "EQP-06",
    label: "Smoke belching",
    fine: 1000,
    category: "Equipment",
  },

  // Parking, operations & public transport
  { code: "PRK-01", label: "Double Parking", fine: 1500, category: "Parking" },
  {
    code: "PRK-02",
    label: 'Parking at designated "No Parking" signs',
    fine: 1500,
    category: "Parking",
  },
  {
    code: "PRK-03",
    label: "Parking in front of a private driveway",
    fine: 1500,
    category: "Parking",
  },
  {
    code: "PRK-04",
    label: "Parking on a crosswalk or sidewalk",
    fine: 1500,
    category: "Parking",
  },
  {
    code: "OPS-01",
    label: "Colorum operation (Private use despite suspended CR)",
    fine: 1500,
    category: "Operations",
  },
  {
    code: "OPS-02",
    label: "Driving tricycle or motorela on a national road",
    fine: 500,
    category: "Operations",
  },
  {
    code: "PUV-01",
    label: "Out of Line / Operating outside authorized route",
    fine: 1500,
    category: "PUV / For Hire",
  },
  {
    code: "PUV-02",
    label: "Operating without Mayor's Permit",
    fine: 1000,
    category: "PUV / For Hire",
  },
  {
    code: "PUV-03",
    label: "No body number / capacity markings",
    fine: 500,
    category: "PUV / For Hire",
  },
  {
    code: "PUV-04",
    label: "No spare tire / No garbage receptacle",
    fine: 500,
    category: "PUV / For Hire",
  },
];

export const VEHICLE_TYPES = [
  "Motorcycle",
  "Tricycle",
  "Sedan",
  "SUV",
  "Pickup",
  "Van",
  "Jeepney",
  "Truck",
  "Bus",
  "E-bike",
];

