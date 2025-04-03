import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RideRequestsService } from './ride-requests.service';
import { RideRequestModel } from '../common/interfaces/ride-requests.interface';

@Controller('ride-requests')
export class RideRequestsController {
    constructor(private readonly rideRequestsService: RideRequestsService) {}

    @Get()
    async findAll(): Promise<RideRequestModel[]> {
        return this.rideRequestsService.findAll();
    }
    
    @Get(':id')
    async findOne(@Param('id') id: string): Promise<RideRequestModel> {
        return this.rideRequestsService.findOne(id);
    }


    @Post()
    public create(@Body() post: RideRequestModel): RideRequestModel {
        return this.rideRequestsService.createRideRequest(post);
    }

    // @Post(':id/assign_driver')
    // async assignDriver(@Param('id') id: string, @Body() assignDriverDto: AssignDriverDto): Promise<RideRequestModel> {
    //     return this.RideRequestsService.assignDriver(id, assignDriverDto.driverId);
    // }

    // @Post(':id/complete')
    // async complete(@Param('id') id: string): Promise<RideRequestModel> {
    //     return this.RideRequestsService.complete(id);
    // }

}
