We're building a split flap display as a simulation in HTML5.

The device will consist of 3 modules:
Line field
Route Field
Destination Field

I want to define the flaps in a JSON file for now.
Each line can have multiple destinations.
Each destination can have multiple routes.

Each line has a background and foreground color.
These affect the line field.
The route and destination field is always navy blue background and white foreground.

Use Helvetica as the font.
The destination is always capitalized.

The platform number and line is to the left these are fixed to "Bahnsteig 1", not a flap, platform number above line.

the route and destination are to the right, route above destination.
the route text is two lines, so make the font smaller.

Also, provide an option to define an audio file for each combination.

Animate the flaps.

Following options for now:
Line 1: Destinations Schildesche and Senne, light blue background, white foreground
Line 2: Destinations Sieker and Milse, lime green background, white foreground
Line 3: Destinations Babenhausen Süd and Dürkopp Tor 6, yellow background, black foreground
Line 4: Destinations Lohmannshof and Stieghorst, red background, white foreground
Line 5: Destinations Heepen and Sennestadt, orange backgeound, black foreground

The route field show stops between the current stop and the destination. These stops should be defined by a name and a "bus connection" boolean flag in the JSON.

The background of the device is white, the glass has rounded corners and a black rubber frame. the device case is made of aluminum, rounded corners.
