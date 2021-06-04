# Covid Rage Room

## Team 17: Nelson Truong, Aurora Yeh, Pompiliu Girlonta

### Introduction

Our project idea was to create a room with objects you could smash over and over. We’re basically taking the idea of a rage room (rooms that people pay to use to smash fake objects for anger therapy) but trying to implement it in a virtual game.


![](doc/room.png)

![](doc/dropping.gif)

![](doc/throwing.gif)

### Advanced Features

#### Collision Detection

The collision detection uses the exact same function as the check_if_colliding() function from the Collision Demo. To check if an object, more specifically a Body object, is colliding with another, we treat both objects as ellipsoids and check if any points overlap. This function is used whenever a time step elapses to see if any objects have collided with a wall in the room. Depending on the wall it collides with, we can determine how to make the object “bounce” off in a realistic fashion.

Each Body object has several properties (shape, material, size, temporary, debris) that are defined when it is created. The temporary property determines what kind of object it is, for example, if a.temporary === U then it is not a wall. Each wall must make the objects bounce a certain direction when a collision is detected, so this property helps determine whether the object is bouncing off the floor, a certain wall, or the roof of the room.

The debris property is also used to determine if the object is a product of shattering. Once the primary object collides with the room, tinier objects are created to emulate debris. Each of these tiny objects should continue to collide with the room but do not create more debris.

#### Mouse Picking

Mouse picking was based on the teapot demo from week 7 Discussion 1B. First an event listener is added to the canvas that detects when the mouse is clicked (mousedown). The position of the mouse click is saved and scaled according to the bounding box to get coordinates within the range of -1 and 1, which is in NDCS. 

To convert coordinates from world space to NDCS, you left-multiply a vector by the camera inverse matrix (W) and then left-multiply the result by the projection transform matrix (P). Therefore, to get from NDCS back to world space, you multiply a vector in NDCS by (WP)-1.

An object is thrown from the center of the screen towards the position the mouse is clicked. To get the center of the screen, left-multiply (0, 0, 0, 1) by (WP)-1 and homogenize. To get the position the object is getting thrown towards, left-multiply (mouseX, mouseY, 1, 1) by (WP)-1 and homogenize. Subtracting the two vectors gets the initial_velocity vector, which can be scaled to change the throwing speed. In our code, the y-direction is reversed, so we had to negate that. 

To get the center position for where to create the object, take (WP)-1 and replace the upper left 3x3 matrix with the identity, turning it into a 4x4 translation matrix. 

### References


examples/collision_demo.js -  Used the Body, Simulation, and Collision Demo classes for reference
