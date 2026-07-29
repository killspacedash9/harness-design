# Custom Devices and Nodes

Harness Design already has a native model for a device with several attached connectors: a **Frame**.

```text
Frame: Engine Control Unit
├── Connector X1
├── Connector X2
└── Connector X3
```

A frame provides visual grouping, a device label, shared movement in Schematic view, native serialization, and optional BOM metadata through a `FramePart`. Each contained connector remains independently positionable and wireable.

## Choose the correct level of customization

There are three distinct requirements that are easy to call “custom components”:

| Requirement | Recommended implementation |
|---|---|
| Visually group several connectors as one device | Native `frames[]` |
| Reuse the same device definition in many documents | JSON device template + ID remapping |
| Render a genuinely new node shape and behavior | Maintain an application fork with a new node type |

Use a Frame unless custom rendering or electrical behavior makes it impossible.

## Create a device in the editor

1. Create the connectors or terminals belonging to the device.
2. Switch to **Schematic**.
3. Select all members.
4. Press `Ctrl+G` / `Cmd+G`, or use the selection context menu's **Group** action.
5. Rename the generated “Group” to the device name.
6. Optionally assign a **Generic Part** for manufacturer, part number, description, URL, color, and BOM information.

Grouping is authored from Schematic view. Layout positions remain independently configurable.

## Native JSON relationships

The core relationship is the frame's `elements` array:

```json
{
  "frames": [
    {
      "id": "device_ecu",
      "label": "Engine Control Unit",
      "partId": "part_ecu",
      "elements": [
        "connector_x1",
        "connector_x2"
      ],
      "schematicPosition": {
        "x": 240,
        "y": 120
      }
    }
  ]
}
```

`elements` contains the IDs of native document elements. It can group connectors or terminals; the existing sample database includes a Battery frame whose members are two Ring terminals.

## Complete multi-connector device example

```json
{
  "version": 0.5,
  "frames": [
    {
      "id": "device_ecu",
      "label": "Engine Control Unit",
      "partId": "part_ecu",
      "elements": [
        "connector_x1",
        "connector_x2"
      ],
      "schematicPosition": {
        "x": 240,
        "y": 120
      }
    }
  ],
  "connectors": [
    {
      "id": "connector_x1",
      "label": "X1",
      "partId": "part_connector_x1",
      "cavities": [
        {
          "id": "x1_pin_1",
          "designation": "1",
          "signal": "BAT+"
        },
        {
          "id": "x1_pin_2",
          "designation": "2",
          "signal": "GND"
        },
        {
          "id": "x1_pin_3",
          "designation": "3",
          "signal": "CAN-H"
        },
        {
          "id": "x1_pin_4",
          "designation": "4",
          "signal": "CAN-L"
        }
      ],
      "schematicPosition": {
        "x": 300,
        "y": 180
      },
      "layoutPosition": {
        "x": 240,
        "y": 300
      }
    },
    {
      "id": "connector_x2",
      "label": "X2",
      "partId": "part_connector_x2",
      "cavities": [
        {
          "id": "x2_pin_1",
          "designation": "1",
          "signal": "SENSOR+"
        },
        {
          "id": "x2_pin_2",
          "designation": "2",
          "signal": "SENSOR-"
        }
      ],
      "schematicPosition": {
        "x": 300,
        "y": 390
      },
      "layoutPosition": {
        "x": 420,
        "y": 300
      }
    }
  ],
  "frameParts": [
    {
      "id": "part_ecu",
      "partNumber": "ECU-1000",
      "manufacturer": "Example Controls",
      "description": "Engine control unit with X1 and X2 interfaces",
      "url": "https://example.com/ecu-1000"
    }
  ],
  "connectorParts": [
    {
      "id": "part_connector_x1",
      "partNumber": "ECU-X1",
      "manufacturer": "Example Controls",
      "description": "Four-position ECU connector",
      "numberOfCavities": 4
    },
    {
      "id": "part_connector_x2",
      "partNumber": "ECU-X2",
      "manufacturer": "Example Controls",
      "description": "Two-position ECU connector",
      "numberOfCavities": 2
    }
  ],
  "wires": [],
  "bundles": []
}
```

The Frame is the device/group. Wires still connect to individual connector cavities:

```json
{
  "id": "wire_battery",
  "color": "Red",
  "source": {
    "id": "connector_x1",
    "handle": "x1_pin_1"
  },
  "target": {
    "id": "battery_connector",
    "handle": "battery_positive"
  }
}
```

For connector wire endpoints:

- `source.id` / `target.id` identifies the connector.
- `source.handle` / `target.handle` identifies the connector cavity.

## FramePart metadata

A frame may reference a reusable generic part through `partId`:

```json
{
  "frames": [
    {
      "id": "battery_device",
      "label": "Battery",
      "partId": "battery_part",
      "elements": ["battery_positive", "battery_negative"]
    }
  ],
  "frameParts": [
    {
      "id": "battery_part",
      "partNumber": "VPX-9400",
      "manufacturer": "Vortex Power Systems",
      "description": "4S1P 14.8 V Li-Ion Battery",
      "color": "Blue",
      "url": "https://example.com/vpx-9400"
    }
  ]
}
```

`frameParts[]` supplies BOM/catalog identity. It does not contain the connectors—the Frame's `elements[]` array does that.

## What Frames provide

- Device label and visual boundary
- Native grouping in Schematic view
- Shared movement of contained elements
- Multiple attached connectors or terminals
- Independent connector cavities and wire endpoints
- Optional BOM identity through `partId`
- Native JSON serialization and export
- Rendering in Schematic and Layout workflows

## What Frames do not provide

- An arbitrary custom SVG device body
- New device-level electrical handles
- A reusable template library by themselves
- Device-specific calculations
- New context-menu or toolbar actions
- A new validation primitive

## Reusable device templates

A Frame stored in one harness document is not automatically a reusable component definition. Keep reusable devices in separate template JSON and instantiate them with new IDs.

Template:

```json
{
  "name": "ECU-1000",
  "frame": {
    "id": "frame",
    "label": "Engine Control Unit",
    "partId": "device_part",
    "elements": ["x1", "x2"],
    "schematicPosition": { "x": 0, "y": 0 }
  },
  "connectors": [
    {
      "id": "x1",
      "partId": "x1_part",
      "cavities": [
        { "id": "x1_1", "designation": "1" },
        { "id": "x1_2", "designation": "2" }
      ],
      "schematicPosition": { "x": 60, "y": 60 },
      "layoutPosition": { "x": 0, "y": 0 }
    },
    {
      "id": "x2",
      "partId": "x2_part",
      "cavities": [
        { "id": "x2_1", "designation": "1" },
        { "id": "x2_2", "designation": "2" }
      ],
      "schematicPosition": { "x": 60, "y": 240 },
      "layoutPosition": { "x": 180, "y": 0 }
    }
  ]
}
```

Instantiate every device with a unique prefix:

```text
ecu_a:frame
ecu_a:x1
ecu_a:x1_1
ecu_a:x1_2

ecu_b:frame
ecu_b:x1
ecu_b:x1_1
ecu_b:x1_2
```

All internal references must be remapped consistently:

- Frame ID
- Frame `elements`
- Connector IDs
- Cavity IDs
- Wire and mate endpoints
- Layout point IDs
- `partId` values, unless parts are intentionally shared catalog records

## Template instantiation helper

```js
function instantiateDevice(template, prefix, offset = { x: 0, y: 0 }) {
  const remap = value => `${prefix}:${value}`;
  const shift = position => position && ({
    x: position.x + offset.x,
    y: position.y + offset.y
  });

  const connectors = template.connectors.map(source => {
    const connector = structuredClone(source);

    connector.id = remap(source.id);
    connector.partId = source.partId ? remap(source.partId) : undefined;
    connector.cavities = source.cavities.map(cavity => ({
      ...structuredClone(cavity),
      id: remap(cavity.id),
      contactPartId: cavity.contactPartId
        ? remap(cavity.contactPartId)
        : undefined
    }));
    connector.schematicPosition = shift(source.schematicPosition);
    connector.layoutPosition = shift(source.layoutPosition);

    return connector;
  });

  const frame = {
    ...structuredClone(template.frame),
    id: remap(template.frame.id),
    partId: template.frame.partId
      ? remap(template.frame.partId)
      : undefined,
    elements: template.frame.elements.map(remap),
    schematicPosition: shift(template.frame.schematicPosition)
  };

  return { frame, connectors };
}
```

Merge an instance into a native document:

```js
const instance = instantiateDevice(
  ecuTemplate,
  "ecu_a",
  { x: 600, y: 300 }
);

document.frames ??= [];
document.connectors ??= [];

document.frames.push(instance.frame);
document.connectors.push(...instance.connectors);
```

If the template includes `frameParts`, `connectorParts`, contacts, wires, or mates, clone those arrays too and remap every reference before merging.

## Stable ID generation

Prefixes are readable for examples, but production importers should generate collision-resistant IDs. One option is Nano ID-compatible URL-safe identifiers:

```js
function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}
```

Build a complete old-ID → new-ID map first, then clone and rewrite the object graph. Do not generate replacements opportunistically while walking references; that can assign different new IDs to the same source object.

```js
const idMap = new Map(allTemplateIds.map(oldId => [oldId, id("ecu")]));
const remap = oldId => idMap.get(oldId) ?? oldId;
```

## Genuine new visual nodes

If the requirement is a single ECU rectangle with connector banks attached to its sides, custom SVG, custom device-level handles, or device-specific controls, a Frame is not enough. That requires extending the application.

A complete new `Device` domain type needs at least:

1. A `devices[]` schema and document migration.
2. `DevicePart` or equivalent BOM data.
3. Schematic node renderer.
4. Layout node renderer.
5. React Flow node-type registrations.
6. Handle and edge registration.
7. Position and dimension calculations.
8. Selection, drag, delete, duplicate, and clipboard behavior.
9. Undo/redo integration.
10. Search, highlighting, and component IDs.
11. Context-menu and property-panel actions.
12. Export, BOM, validation, and revision behavior.
13. Round-trip serialization tests.

Conceptually:

```js
schematicNodeTypes.device = SchematicDeviceNode;
layoutNodeTypes.device = LayoutDeviceNode;
```

The current static app is built from compiled production chunks, so a new renderer means maintaining patches against minified bundles or reconstructing the editor from source. That is possible but brittle: bundle identifiers, module boundaries, and generated CSS can change on every upstream build.

## Recommendation

Use:

```text
Frame
├── Connector X1
├── Connector X2
├── Connector X3
└── Generic Part metadata
```

Add a small template importer that clones native JSON and remaps IDs. This gives reusable multi-connector devices without introducing a new electrical primitive or maintaining a custom minified renderer.
