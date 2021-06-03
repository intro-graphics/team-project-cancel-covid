import {defs, tiny} from './examples/common.js';

// Pull these names into this module's scope for convenience:
const {Vector, Vector3, vec, vec3, vec4, color, hex_color, Matrix, Mat4,
    Light, Shape, Material, Shader, Texture, Scene} = tiny;

// Types of walls
const R = 0;
const F = 1;
const N = 2;
const S = 3;
const W = 4;
const E = 5;
const U = -1;

class ReversedCube extends Shape {
    constructor() {
        super("position", "normal",);
        // Loop 3 times (for each axis), and inside loop twice (for opposing cube sides):
        this.arrays.position = Vector3.cast(
            [-1, -1, -1], [1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, -1], [-1, 1, -1], [1, 1, 1], [-1, 1, 1],
            [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1], [1, -1, 1], [1, -1, -1], [1, 1, 1], [1, 1, -1],
            [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, -1], [-1, -1, -1], [1, 1, -1], [-1, 1, -1]);
        this.arrays.normal = Vector3.cast(
            [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0], [0, -1, 0],
            [1, 0, 0], [1, 0, 0], [1, 0, 0], [1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0],
            [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, -1], [0, 0, 1], [0, 0, 1], [0, 0, 1], [0, 0, 1]);
        // Arrange the vertices into a square shape in texture space too:
        this.indices.push(0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6, 8, 9, 10, 9, 11, 10, 12, 13,
            14, 13, 15, 14, 16, 17, 18, 17, 19, 18, 20, 21, 22, 21, 23, 22);
    }
}

export class Body {
    // **Body** can store and update the properties of a 3D body that incrementally
    // moves from its previous place due to velocities.  It conforms to the
    // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
    constructor(shape, material, size, temporary, debris, duration) {
        Object.assign(this,
            {shape, material, size, temporary, debris, duration})
    }

    // (within some margin of distance).
    static intersect_cube(p, margin = 0) {
        return p.every(value => value >= -1 - margin && value <= 1 + margin)
    }

    static intersect_sphere(p, margin = 0) {
        return p.dot(p) < 1 + margin;
    }

    emplace(location_matrix, linear_velocity, angular_velocity, spin_axis = vec3(0, 0, 0).randomized(1).normalized()) {                               // emplace(): assign the body's initial values, or overwrite them.
        this.center = location_matrix.times(vec4(0, 0, 0, 1)).to3();
        this.rotation = Mat4.translation(...this.center.times(-1)).times(location_matrix);
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // drawn_location gets replaced with an interpolated quantity:
        this.drawn_location = location_matrix;
        this.temp_matrix = Mat4.identity();
        return Object.assign(this, {linear_velocity, angular_velocity, spin_axis})
    }

    advance(time_amount) {
        // advance(): Perform an integration (the simplistic Forward Euler method) to
        // advance all the linear and angular velocities one time-step forward.
        this.previous = {center: this.center.copy(), rotation: this.rotation.copy()};
        // Apply the velocities scaled proportionally to real time (time_amount):
        // Linear velocity first, then angular:
        this.center = this.center.plus(this.linear_velocity.times(time_amount));
        this.rotation.pre_multiply(Mat4.rotation(time_amount * this.angular_velocity, ...this.spin_axis));
    }

    // The following are our various functions for testing a single point,
    // p, against some analytically-known geometric volume formula

    blend_rotation(alpha) {
        // blend_rotation(): Just naively do a linear blend of the rotations, which looks
        // ok sometimes but otherwise produces shear matrices, a wrong result.

        // TODO:  Replace this function with proper quaternion blending, and perhaps
        // store this.rotation in quaternion form instead for compactness.
        return this.rotation.map((x, i) => vec4(...this.previous.rotation[i]).mix(x, alpha));
    }

    blend_state(alpha) {
        // blend_state(): Compute the final matrix we'll draw using the previous two physical
        // locations the object occupied.  We'll interpolate between these two states as
        // described at the end of the "Fix Your Timestep!" blog post.
        this.drawn_location = Mat4.translation(...this.previous.center.mix(this.center, alpha))
            .times(this.blend_rotation(alpha))
            .times(Mat4.scale(...this.size));
    }

    check_if_colliding(b, collider) {
        // check_if_colliding(): Collision detection function.
        // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
        // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
        // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
        // hack (there are perfectly good analytic expressions that can test if two ellipsoids
        // intersect without discretizing them into points).
        if (this == b)
            return false;
        // Nothing collides with itself.
        // Convert sphere b to the frame where a is a unit sphere:
        const T = this.inverse.times(b.drawn_location, this.temp_matrix);

        const {intersect_test, points, leeway} = collider;
        // For each vertex in that b, shift to the coordinate frame of
        // a_inv*b.  Check if in that coordinate frame it penetrates
        // the unit sphere at the origin.  Leave some leeway.
        return points.arrays.position.some(p =>
            intersect_test(T.times(p.to4(1)).to3(), leeway));
    }
}


export class Simulation extends Scene {
    // **Simulation** manages the stepping of simulation time.  Subclass it when making
    // a Scene that is a physics demo.  This technique is careful to totally decouple
    // the simulation from the frame rate (see below).
    constructor() {
        super();
        Object.assign(this, {time_accumulator: 0, time_scale: 1, t: 0, dt: 1 / 20, bodies: [], steps_taken: 0});
    }

    simulate(frame_time) {
        // simulate(): Carefully advance time according to Glenn Fiedler's
        // "Fix Your Timestep" blog post.
        // This line gives ourselves a way to trick the simulator into thinking
        // that the display framerate is running fast or slow:
        frame_time = this.time_scale * frame_time;

        // Avoid the spiral of death; limit the amount of time we will spend
        // computing during this timestep if display lags:
        this.time_accumulator += Math.min(frame_time, 0.1);
        // Repeatedly step the simulation until we're caught up with this frame:
        while (Math.abs(this.time_accumulator) >= this.dt) {
            // Single step of the simulation for all bodies:
            this.update_state(this.dt);
            for (let b of this.bodies)
                b.advance(this.dt);
            // Following the advice of the article, de-couple
            // our simulation time from our frame rate:
            this.t += Math.sign(frame_time) * this.dt;
            this.time_accumulator -= Math.sign(frame_time) * this.dt;
            this.steps_taken++;
        }
        // Store an interpolation factor for how close our frame fell in between
        // the two latest simulation time steps, so we can correctly blend the
        // two latest states and display the result.
        let alpha = this.time_accumulator / this.dt;
        for (let b of this.bodies) b.blend_state(alpha);
    }

    make_control_panel() {
        // make_control_panel(): Create the buttons for interacting with simulation time.
        this.key_triggered_button("Speed up time", ["Shift", "T"], () => this.time_scale *= 5);
        this.key_triggered_button("Slow down time", ["t"], () => this.time_scale /= 5);
        this.new_line();
        this.live_string(box => {
            box.textContent = "Time scale: " + this.time_scale
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = "Fixed simulation time step size: " + this.dt
        });
        this.new_line();
        this.live_string(box => {
            box.textContent = this.steps_taken + " timesteps were taken so far."
        });
    }

    display(context, program_state) {
        // display(): advance the time and state of our whole simulation.
        if (program_state.animate)
            this.simulate(program_state.animation_delta_time);
        // Draw each shape at its current location:
        for (let b of this.bodies)
            b.shape.draw(context, program_state, b.drawn_location, b.material);
    }

    update_state(dt)      // update_state(): Your subclass of Simulation has to override this abstract function.
    {
        throw "Override this"
    }
}


export class Test_Data {
    // **Test_Data** pre-loads some Shapes and Textures that other Scenes can borrow.
    constructor() {
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            // grid: new Texture("assets/grid.png"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(3, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            rcube: new ReversedCube(),
            square: new defs.Square(),
        };
    }

    random_shape(shape_list = this.shapes) {
        // random_shape():  Extract a random shape from this.shapes.
        const shape_names = Object.keys(shape_list);
        return shape_list[shape_names[~~(shape_names.length * Math.random())]]
    }
}


export class Test extends Simulation {
    
    constructor() {
        super();
        this.data = new Test_Data();
        this.shapes = Object.assign({}, this.data.shapes);
        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];
        this.collider_selection = 0;
        this.room_size = 75;

        // Textures
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }

        // Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#ffffff")}),
            wallpaper: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: 1, color: hex_color("#c4aa7e")}),
            stars: new Material(new defs.Phong_Shader(), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            inactive_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, .5, .5, 1), ambient: .2,
                texture: this.textures.rgb
            }),
            active_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, 0, 0, 1), ambient: .5,
                texture: this.textures.rgb
            }),
            bright: new Material(new defs.Phong_Shader(), {
                color: color(0, 1, 0, .5), ambient: 1
            }),
            floor: new Material(new defs.Phong_Shader(1), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            wall: new Material(new defs.Phong_Shader(1), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
        };
    }

    random_color() {
        return this.material.override(color(.6, .6 * Math.random(), .6 * Math.random(), 1));
    }

    update_state(dt) {
        // update_state():  Override the base time-stepping code to say what this particular
        // scene should do to its bodies every frame -- including applying forces.
        // Generate additional moving bodies if there ever aren't enough:

        if (this.bodies.length === 0) {
            //this.bodies.push(new Body(this.shapes.square, this.materials.plastic, vec3(1, 1 + Math.random(), 1), false, false)
            //    .emplace(Mat4.translation(0, -10, 0)
            //            .times(Mat4.rotation(Math.PI / 2, 1, 0, 0))
            //            .times(Mat4.scale(50, 50, 1)),
            //        vec3(0, 0, 0), 0));
            let floor_transform = Mat4.rotation(Math.PI / 2, 1, 0, 0)
                .times(Mat4.scale(this.room_size, this.room_size, 1))
                .times(Mat4.translation(0, 0, -1));
            this.bodies.push(new Body(this.shapes.square, this.materials.floor, vec3(1, 1 + Math.random(), 1), F, false, 0)
                .emplace(floor_transform, vec3(0, 0, 0), 0));

            // walls
            let wall_transform = Mat4.scale(this.room_size, this.room_size, 1)
                .times(Mat4.translation(0, 0, -1));

            // walls along the z-axis
            this.bodies.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1), S, false, 0)
                .emplace(Mat4.translation(0, this.room_size / 2, this.room_size / 2).times(wall_transform),
                    vec3(0, 0, 0), 0));
            this.bodies.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1), N, false, 0)
                .emplace(Mat4.translation(0, this.room_size / 2, -this.room_size / 2).times(wall_transform),
                    vec3(0, 0, 0), 0));
            wall_transform = Mat4.rotation(Math.PI / 2, 0, 1, 0).times(wall_transform);

            // walls along the x-axis
            this.bodies.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1), E, false, 0)
                .emplace(Mat4.translation(this.room_size / 2, this.room_size / 2, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));
            this.bodies.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1), W, false, 0)
                .emplace(Mat4.translation(-this.room_size / 2, this.room_size / 2, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));
        }

        while (this.bodies.length < 6)
            this.bodies.push(new Body(this.shapes.cube, this.materials.plastic, vec3(1, 1, 1), U, false, 0)
                .emplace(Mat4.translation(...vec3(0, 15, 0).randomized(10)),
                    vec3(0, -1, 0).randomized(2).normalized().times(3), Math.random()));

        // Delete bodies that have lasted for too long;
        this.bodies = this.bodies.filter(b => (!b.debris && b.duration < 100) || (b.debris && b.duration < 10));

        // Delete bodies that have become too small;
        this.bodies = this.bodies.filter(b => b.size.dot(b.size) > 0.001);


        for (let a of this.bodies) {
            if (a.temporary !== U) {
                continue;
            }
            a.duration += dt;
            // Gravity on Earth, where 1 unit in world space = 1 meter:
            a.linear_velocity[1] += dt * -9.8;
        }

                    
        const collider = this.colliders[this.collider_selection];
        let walls = this.bodies.filter(b => b.temporary !== U);
        // Collider process
        for (let w of walls) {
            w.inverse = Mat4.inverse(w.drawn_location);
            for (let b of this.bodies) {

                // If this is a wall
                if (b.temporary !== U) {
                    continue;
                }

                let r = w.check_if_colliding(b, collider);
                if (r) {

                    // Collided with the wall (what kind of wall)
                    switch(w.temporary) {
                        // F for floor
                        case F: {
                            if (b.linear_velocity[1] < 0)
                                b.linear_velocity[1] *= -.8;
                            break;
                        }
                        // N for north
                        case N: {
                            if (b.linear_velocity[2] < 0)
                                b.linear_velocity[2] *= -.8;
                            break;
                        }
                        // S for south
                        case S: {
                            if (b.linear_velocity[2] > 0)
                                b.linear_velocity[2] *= -.8;
                            break;
                        }
                        // W for west
                        case W: {
                            if (b.linear_velocity[0] < 0)
                                b.linear_velocity[0] *= -.8;
                            break;
                        }
                        // E for east
                        case E: {
                            if (b.linear_velocity[0] > 0)
                                b.linear_velocity[0] *= -.8;
                            break;
                        }
                        default: {
                            if (b.linear_velocity[1] < 0)
                                b.linear_velocity[1] *= -.8;
                            break;
                        }
                    }

                    if (b.debris) {
                        continue;
                    }

                    let s = b.size;
                    b.size = s.times(1/1.05);

                    // Shattering process
                    let i = 0;
                    for (i = 0; i < 4; i++) {
                        this.bodies.push(new Body(this.shapes.cube, this.materials.plastic, s.times(1/4), U, true, 0)
                            .emplace(b.drawn_location,
                                vec3(0, 1, 0).randomized(2).normalized().times(3), Math.random()));
                    }
                }
            }
        }

//         // for (let w of walls) {
//         for (let b of this.bodies) {
//             // Cache the inverse of matrix of body "b" to save time.
//             b.inverse = Mat4.inverse(b.drawn_location);
//             let a = this.bodies[0];
// //             w.inverse = Mat4.inverse(w.drawn_location);

// //             for (let b of bodies) {

// //                 // If this is a wall
// //                 if (!b.temporary) {
// //                     continue;
// //                 }

// //                 let r = w.check_if_colliding(b, collider);
// //                 if (r) {
// //                     // Collided with the wall (what kind of wall)
// //                     // If about to fall through floor, reverse y velocity:
// //                     if (b.linear_velocity[1] < 0) {
// //                         b.linear_velocity[1] *= -.8;
// //                     }
// //                     if (b.debris) {
// //                         continue;
// //                     }
// //                     // Shattering process
// //                     let i = 0;
// //                     for (i = 0; i < 4; i++) {
// //                         this.bodies.push(new Body(this.shapes.cube, this.materials.plastic, vec3(0.25, 0.25, 0.25), true, true)
// //                             .emplace(b.drawn_location,
// //                                 vec3(0, 1, 0).randomized(2).normalized().times(3), Math.random()));
// //                     }
// //                 }
// //             }

//             let r = a.check_if_colliding(b, collider);
//             if (r) {
//                 // If about to fall through floor, reverse y velocity:
//                 if (b.linear_velocity[1] < 0) {
//                     b.linear_velocity[1] *= -.8;
//                 }
//                 if (b.debris) {
//                     continue;
//                 }
//                 // Shattering process
//                 let i = 0;
//                 for (i = 0; i < 4; i++) {
//                     this.bodies.push(new Body(this.shapes.cube, this.materials.plastic, vec3(0.25, 0.25, 0.25), N, true)
//                         .emplace(b.drawn_location,
//                             vec3(0, 1, 0).randomized(2).normalized().times(3), Math.random()));
//                 }
//                 b.material = this.materials.plastic.override({color: color(0.5, 0, 0, 1)});
//             }
//         }
    }

    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            this.children.push(new defs.Program_State_Viewer());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, -5, -20));
        }
        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 20, 8, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 100)];

        const {points, leeway} = this.colliders[this.collider_selection];
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);
        //for (let b of this.bodies)
        //    points.draw(context, program_state, b.drawn_location.times(Mat4.scale(...size)), this.materials.bright, "LINE_STRIP");
    }

}


export class Aurora_Test extends Simulation {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // Shapes
        this.shapes = {
            donut: new defs.Torus(15, 15, [[0, 2], [0, 1]]),
            cone: new defs.Closed_Cone(4, 10, [[0, 2], [0, 1]]),
            capped: new defs.Capped_Cylinder(4, 12, [[0, 2], [0, 1]]),
            ball: new defs.Subdivision_Sphere(3, [[0, 1], [0, 1]]),
            cube: new defs.Cube(),
            prism: new (defs.Capped_Cylinder.prototype.make_flat_shaded_version())(10, 10, [[0, 2], [0, 1]]),
            gem: new (defs.Subdivision_Sphere.prototype.make_flat_shaded_version())(2),
            donut2: new (defs.Torus.prototype.make_flat_shaded_version())(20, 20, [[0, 2], [0, 1]]),
            room: new (defs.Cube.prototype.make_flat_shaded_version()),
            wall: new (defs.Square.prototype.make_flat_shaded_version()),
            square: new defs.Square(),
        };

        // Textures
        this.textures = {
            rgb: new Texture("assets/rgb.jpg"),
            earth: new Texture("assets/earth.gif"),
            stars: new Texture("assets/stars.png"),
            text: new Texture("assets/text.png"),
        }

        // Materials
        this.materials = {
            plastic: new Material(new defs.Phong_Shader(),
                {ambient: .4, diffusivity: .6, color: hex_color("#1a9ffa")}),
            wallpaper: new Material(new defs.Phong_Shader(),
                {ambient: 0.2, diffusivity: 1, color: hex_color("#c4aa7e")}),
            stars: new Material(new defs.Phong_Shader(), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            inactive_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, .5, .5, 1), ambient: .2,
                texture: this.textures.rgb
            }),
            active_color: new Material(new defs.Fake_Bump_Map(1), {
                color: color(.5, 0, 0, 1), ambient: .5,
                texture: this.textures.rgb
            }),
            bright: new Material(new defs.Phong_Shader(), {
                color: color(0, 1, 0, .5), ambient: 1
            }),
            floor: new Material(new defs.Phong_Shader(1), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
            wall: new Material(new defs.Phong_Shader(1), {
                ambient: .4, color: color(.4, .8, .4, 1),
                texture: this.textures.stars
            }),
        };

        // Make simpler dummy shapes for representing all other shapes during collisions:
        this.colliders = [
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(1), leeway: .5},
            {intersect_test: Body.intersect_sphere, points: new defs.Subdivision_Sphere(2), leeway: .3},
            {intersect_test: Body.intersect_cube, points: new defs.Cube(), leeway: .1}
        ];

        this.collider_selection = 0;
        this.gravity = 20;
        this.room_size = 75;

        this.walls = [];
    }

    make_control_panel() {
    }


    // from discussion 1b slides
    // adds event listeners for mouse
    add_mouse_controls(canvas, program_state, context) {
        this.mouse = {"from_center" : vec(0, 0)};
        const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
            vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.left + rect.right) / 2),
                (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.bottom + rect.top) / 2));

        document.addEventListener("mouseup", e => {
            this.mouse.anchor = undefined;
        });
        canvas.addEventListener("mousedown", e => {
            e.preventDefault();
            this.mouse.anchor = mouse_position(e);

            this.throw_object(e, mouse_position(e), program_state, context)
            console.log(mouse_position(e));
        });
        canvas.addEventListener("mousemove", e => {
            e.preventDefault();
            this.mouse.anchor = mouse_position(e);
        });
        canvas.addEventListener("mouseup", e => {
            if (!this.mouse.anchor)
                this.mouse.from_center.scale_by(0);
        });
    }

    // returns a height given the initial height and the time elapsed (in seconds) from the initial
    // drop that simulates a bouncing motion
    get_height_at_time(init_height, init_velocity, time_elapsed) {
        // can adjust this
        let max_bounces = init_height;

        // decrease max height over time
        let max_height = Math.max(init_height - time_elapsed, 0);
        let max_velocity = Math.sqrt(2 * this.gravity * max_height);
        let period = 2 / this.gravity * max_velocity;

        // stop bouncing after max_bounces
        if ((time_elapsed + (1 / 2 * period)) / (period) > max_bounces) {
            return 0;
        }

        // otherwise, calculate the height at time t
        let t = (time_elapsed + (1 / 2 * period)) % (period);
        let h = Math.max(- 1 / 2 * this.gravity * t ** 2 + max_velocity * t, 0);
        return h;
    }

    // when mouse is clicked, throw an object
    throw_object(e, pos, context, program_state) {
        let pos_ndc_far = vec4(pos[0], pos[1], 1.0, 1.0);
        let center_ndc_near = vec4(0.0, 0.0, 0.0, 1.0);

        let P = program_state.program_state.projection_transform;
        let V = program_state.program_state.camera_transform;
        let W = program_state.program_state.camera_inverse;

        let pos_world_far = Mat4.inverse(P.times(V)).times(pos_ndc_far);
        let center_world_near = Mat4.inverse(P.times(V)).times(center_ndc_near);
        let camera_pos = Mat4.inverse(P.times(W)).times(center_ndc_near);
        let dir = W.times(pos_ndc_far).minus(W.times(center_ndc_near));
        console.log(dir);

        pos_world_far.scale_by(1 / pos_world_far[3]);
        center_world_near.scale_by(1 / center_world_near[3]);
        camera_pos.scale_by(1 / camera_pos[3]);
        let direction_world = pos_world_far.minus(center_world_near);
        direction_world.scale_by(1/2);
        direction_world[1] = -direction_world[1];

        console.log(center_world_near);
        console.log(direction_world);

        // convert to a translation matrix
        let a = Mat4.inverse(P.times(W));
        a[0] = vec4(1, 0, 0, a[0][3]);
        a[1] = vec4(0, 1, 0, a[1][3]);
        a[2] = vec4(0, 0, 1, a[2][3]);
        a[3] = vec4(0, 0, 0, a[3][3]);
        console.log(a);
        let b = new Body(this.shapes.cube, this.materials.plastic, vec3(1, 1, 1))
            .emplace(a, direction_world, 0);
        let object = {
            body: b,
            start_time: program_state.program_state.animation_time,
            end_time: program_state.program_state.animation_time + 10000,
        }
        this.bodies.push(object);
        console.log(object);
    }


    display(context, program_state) {
        // display(): Draw everything else in the scene besides the moving bodies.
        super.display(context, program_state);

        // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.translation(0, -5, 0));

            // add event listeners
            let canvas = context.canvas;
            const mouse_position = (e, rect = canvas.getBoundingClientRect()) =>
                vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.left + rect.right) / 2),
                    (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.bottom + rect.top) / 2));
            canvas.addEventListener("mousedown", e => {
                e.preventDefault();
                this.throw_object(e, mouse_position(e), program_state, context);
            });

            // create room
            // floor
            let floor_transform = Mat4.rotation(Math.PI / 2, 1, 0, 0)
                .times(Mat4.scale(this.room_size, this.room_size, 1))
                .times(Mat4.translation(0, 0, -1));
            this.walls.push(new Body(this.shapes.square, this.materials.floor, vec3(1, 1 + Math.random(), 1))
                .emplace(floor_transform, vec3(0, 0, 0), 0));

            // walls
            let wall_transform = Mat4.scale(this.room_size, this.room_size, 1)
                .times(Mat4.translation(0, 0, -1));
            this.walls.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1))
                .emplace(Mat4.translation(0, this.room_size / 2, this.room_size / 2).times(wall_transform),
                    vec3(0, 0, 0), 0));
            this.walls.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1))
                .emplace(Mat4.translation(0, this.room_size / 2, -this.room_size / 2).times(wall_transform),
                    vec3(0, 0, 0), 0));
            wall_transform = Mat4.rotation(Math.PI / 2, 0, 1, 0).times(wall_transform);
            this.walls.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1))
                .emplace(Mat4.translation(this.room_size / 2, this.room_size / 2, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));
            this.walls.push(new Body(this.shapes.square, this.materials.wall, vec3(1, 1 + Math.random(), 1))
                .emplace(Mat4.translation(-this.room_size / 2, this.room_size / 2, 0).times(wall_transform),
                    vec3(0, 0, 0), 0));

        }

        program_state.projection_transform = Mat4.perspective(
            Math.PI / 4, context.width / context.height, 1, 100);

        // *** Lights: *** Values of vector or point lights.
        const light_position = vec4(0, 20, 8, 1);
        program_state.lights = [new Light(light_position, color(1, 1, 1, 1), 100)];

        const t = program_state.animation_time;
        const dt = program_state.animation_delta_time;

        const {points, leeway} = this.colliders[this.collider_selection];
        const size = vec3(1 + leeway, 1 + leeway, 1 + leeway);

        for (let wall of this.walls) {
            points.draw(context, program_state, wall.drawn_location, wall.material);
        }

        this.bodies = this.bodies.filter(b => b.end_time > t);
        const collider = this.colliders[this.collider_selection];
        if (this.bodies.length > 0) {
            for (let i = 0; i < this.bodies.length; i++) {
                let obj = this.bodies[i].body;

                // collision detection

                // gravity
                obj.linear_velocity[1] -= this.gravity * 1/100;

                // hit floor
                if (obj.center[1] < 1 && obj.linear_velocity[1] < 0) {
                    obj.linear_velocity[1] *= -.8;
                }
                // // hit left wall
                // if (obj.center[0] < -this.room_size / 2 && obj.linear_velocity[0] < 0) {
                //     obj.linear_velocity[0] *= -.8;
                // }
                // // hit backward wall
                // if (obj.center[2] > this.room_size / 2 && obj.linear_velocity[2] > 0) {
                //     obj.linear_velocity[2] *= -.8;
                // }
                // // hit forward wall
                // if (obj.center[2] < -this.room_size / 2 && obj.linear_velocity[2] < 0) {
                //     console.log("bounce")
                //     obj.linear_velocity[2] *= -.8;
                // }
                // console.log("drew box")
                obj.shape.draw(context, program_state, obj.drawn_location, obj.material);
                obj.advance(1/1000);
                obj.blend_state(t - this.bodies[i].start_time);
                // console.log(obj.center);
                // console.log(obj.drawn_location);
            }

        }

        // TODO:  Draw your entire scene here.  Use this.draw_box( graphics_state, model_transform ) to call your helper.
    }
}